import { listUsers, findUserById, type PublicUser } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { ClubError } from "@/lib/errors"
import { appendRatingEvent } from "@/lib/rating-events"
import { computeLeague, RankingError, type LeagueView, type RatingInput, type WeekInput } from "@/lib/ranking"

export type MovieRecord = {
  id: number
  movie: string
  suggesterId: number
  suggesterName: string
  suggestedAt: string
  note: string | null
  // When this movie entered the ranking. Null until the first score.
  // Set once, so later edits do not reshuffle replay order.
  rankedAt: string | null
  ratingCount: number
  avgExperience: number | null
  avgQuality: number | null
}

export type RatingView = {
  userId: number
  name: string
  experience: number
  quality: number
  createdAt: string
  updatedAt: string
}

type MovieRow = {
  id: number
  movie: string
  suggester_id: number
  suggester_name: string
  suggested_at: string
  note: string | null
  ranked_at: string | null
  rating_count: number
  avg_experience: number | null
  avg_quality: number | null
}

const MOVIE_SELECT = `
  SELECT movies.id, movies.movie, movies.suggester_id, movies.suggested_at, movies.note,
         movies.ranked_at, users.name AS suggester_name,
         (SELECT COUNT(*) FROM ratings WHERE ratings.movie_id = movies.id) AS rating_count,
         (SELECT AVG(experience) FROM ratings WHERE ratings.movie_id = movies.id) AS avg_experience,
         (SELECT AVG(quality) FROM ratings WHERE ratings.movie_id = movies.id) AS avg_quality
  FROM movies
  JOIN users ON users.id = movies.suggester_id
`

function mapMovie(row: MovieRow): MovieRecord {
  return {
    id: row.id,
    movie: row.movie,
    suggesterId: row.suggester_id,
    suggesterName: row.suggester_name,
    suggestedAt: row.suggested_at,
    note: row.note,
    rankedAt: row.ranked_at,
    ratingCount: Number(row.rating_count),
    avgExperience: row.avg_experience == null ? null : Number(row.avg_experience),
    avgQuality: row.avg_quality == null ? null : Number(row.avg_quality),
  }
}

export function listMovies(): MovieRecord[] {
  const rows = getDb()
    .prepare(`${MOVIE_SELECT} ORDER BY movies.suggested_at DESC, movies.id DESC`)
    .all() as MovieRow[]
  return rows.map(mapMovie)
}

export function unwatchedMovies(): MovieRecord[] {
  return listMovies().filter((movie) => movie.ratingCount === 0)
}

export function ratedMovies(): MovieRecord[] {
  return listMovies()
    .filter((movie) => movie.ratingCount > 0)
    .sort((a, b) => {
      const byTime = (b.rankedAt ?? "").localeCompare(a.rankedAt ?? "")
      if (byTime !== 0) return byTime
      return b.id - a.id
    })
}

export function getMovie(id: number): MovieRecord | null {
  const row = getDb().prepare(`${MOVIE_SELECT} WHERE movies.id = ?`).get(id) as MovieRow | undefined
  return row ? mapMovie(row) : null
}

export function getRatings(movieId: number): RatingView[] {
  const rows = getDb()
    .prepare(
      `SELECT ratings.user_id, users.name, ratings.experience, ratings.quality,
              ratings.created_at, ratings.updated_at
       FROM ratings
       JOIN users ON users.id = ratings.user_id
       WHERE ratings.movie_id = ?
       ORDER BY users.name COLLATE NOCASE`,
    )
    .all(movieId) as {
    user_id: number
    name: string
    experience: number
    quality: number
    created_at: string
    updated_at: string
  }[]
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    experience: row.experience,
    quality: row.quality,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

function requireUser(userId: number): PublicUser {
  const row = findUserById(userId)
  if (!row) throw new ClubError("That account is no longer on the list.", "no_user")
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    isAdmin: row.is_admin === 1,
  }
}

function requireMovieId(raw: unknown): number {
  const movieId = typeof raw === "number" ? raw : Number(String(raw ?? "").trim())
  if (!Number.isInteger(movieId) || movieId < 1) {
    throw new ClubError("That movie isn't on the list.", "no_movie")
  }
  return movieId
}

function cleanMovie(raw: string): string {
  const movie = raw.trim().replace(/\s+/g, " ")
  if (movie.length < 1 || movie.length > 200) {
    throw new ClubError("Give the movie a title, up to 200 characters.", "bad_movie")
  }
  return movie
}

function cleanNote(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const note = raw.trim()
  if (!note) return null
  if (note.length > 280) {
    throw new ClubError("Keep the note under 280 characters.", "bad_note")
  }
  return note
}

function cleanTimestamp(raw: string | undefined, fallback: string): string {
  const value = raw ?? fallback
  if (Number.isNaN(Date.parse(value))) {
    throw new ClubError("That date is not valid.", "bad_date")
  }
  return value
}

export function parseScore(raw: unknown, label: string): number {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim())
  if (!Number.isFinite(value)) {
    throw new ClubError(`Choose a ${label} score from 1 to 10.`, "bad_rating")
  }
  const doubled = Math.round(value * 2)
  if (Math.abs(value * 2 - doubled) > 1e-6 || doubled < 2 || doubled > 20) {
    throw new ClubError(`${label} scores run from 1 to 10, in half-point steps.`, "bad_rating")
  }
  return doubled / 2
}

export function suggestMovie(
  userId: number,
  movieRaw: string,
  noteRaw: string | null,
  opts?: { suggestedAt?: string },
): MovieRecord {
  const user = requireUser(userId)
  const movie = cleanMovie(movieRaw)
  const note = cleanNote(noteRaw)
  const suggestedAt = cleanTimestamp(opts?.suggestedAt, new Date().toISOString())
  const db = getDb()
  const saved = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO movies (movie, suggester_id, suggested_at, note)
         VALUES (?, ?, ?, ?)`,
      )
      .run(movie, user.id, suggestedAt, note)
    const movieId = Number(info.lastInsertRowid)
    appendRatingEvent(db, {
      actorId: user.id,
      type: "elo.movie.suggested",
      movieId,
      payload: { title: movie, note, suggestedAt, suggesterId: user.id, rankedAt: null },
    })
    const created = getMovie(movieId)
    if (!created) throw new ClubError("The suggestion didn't save.", "suggest_failed")
    return created
  })()
  return saved
}

export function submitRating(
  userId: number,
  movieIdRaw: unknown,
  experienceRaw: unknown,
  qualityRaw: unknown,
  opts?: { at?: string },
): void {
  const user = requireUser(userId)
  const movieId = requireMovieId(movieIdRaw)
  const movie = getMovie(movieId)
  if (!movie) throw new ClubError("That movie isn't on the list.", "no_movie")
  if (movie.suggesterId === user.id) {
    throw new ClubError(
      "Pickers don't score their own movie. The ranking system rejects it, so your taste is never used to defend your own pick.",
      "suggester_rating",
    )
  }
  const experience = parseScore(experienceRaw, "enjoyment")
  const quality = parseScore(qualityRaw, "quality")
  const at = cleanTimestamp(opts?.at, new Date().toISOString())
  const db = getDb()
  const save = db.transaction(() => {
    const prior = db
      .prepare("SELECT experience, quality FROM ratings WHERE movie_id = ? AND user_id = ?")
      .get(movie.id, user.id) as { experience: number; quality: number } | undefined
    db.prepare(
      `INSERT INTO ratings (movie_id, user_id, experience, quality, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(movie_id, user_id) DO UPDATE SET
         experience = excluded.experience,
         quality = excluded.quality,
         updated_at = excluded.updated_at`,
    ).run(movie.id, user.id, experience, quality, at, at)
    // First score time only. Edits change updated_at and leave ranked_at alone,
    // including movies migrated from a locked week (their ranked_at is the lock time).
    db.prepare(
      `UPDATE movies
       SET ranked_at = (SELECT MIN(created_at) FROM ratings WHERE movie_id = movies.id)
       WHERE id = ? AND ranked_at IS NULL`,
    ).run(movie.id)
    appendRatingEvent(db, {
      actorId: user.id,
      type: prior ? "elo.rating.changed" : "elo.rating.set",
      movieId: movie.id,
      payload: prior
        ? { experience, quality, at, previous: { experience: prior.experience, quality: prior.quality } }
        : { experience, quality, at },
    })
  })
  save()
}

export function removeSuggestion(userId: number, movieIdRaw: unknown): void {
  const user = requireUser(userId)
  const movieId = requireMovieId(movieIdRaw)
  const db = getDb()
  const remove = db.transaction(() => {
    const movie = getMovie(movieId)
    if (!movie) throw new ClubError("That suggestion is already gone.", "no_movie")
    if (movie.suggesterId !== user.id && !user.isAdmin) {
      throw new ClubError("Only the person who suggested this, or an admin, can remove it.", "forbidden")
    }
    if (movie.ratingCount > 0) {
      throw new ClubError("This movie already has scores, so it stays in the ranking.", "has_ratings")
    }
    const info = db
      .prepare("DELETE FROM movies WHERE id = ? AND NOT EXISTS (SELECT 1 FROM ratings WHERE movie_id = ?)")
      .run(movie.id, movie.id)
    if (info.changes !== 1) {
      throw new ClubError("This movie already has scores, so it stays in the ranking.", "has_ratings")
    }
    appendRatingEvent(db, {
      actorId: user.id,
      type: "elo.movie.removed",
      movieId: movie.id,
      payload: {
        title: movie.movie,
        note: movie.note,
        suggestedAt: movie.suggestedAt,
        suggesterId: movie.suggesterId,
      },
    })
  })
  remove()
}

function ratingsToInput(ratings: RatingView[]): Record<string, RatingInput> {
  return Object.fromEntries(
    ratings.map((rating) => [rating.name, { experience: rating.experience, quality: rating.quality }]),
  )
}

function replayStamp(movie: MovieRecord, ratings: RatingView[]): string {
  if (movie.rankedAt) return movie.rankedAt
  const created = ratings.map((rating) => rating.createdAt).sort()
  return created[0] ?? movie.suggestedAt
}

function movieToInput(movie: MovieRecord, ratings: RatingView[]): WeekInput {
  const rankedAt = replayStamp(movie, ratings)
  return {
    week_id: String(movie.id),
    suggester: movie.suggesterName,
    movie: movie.movie,
    date: rankedAt.slice(0, 10),
    ranked_at: rankedAt,
    ratings: ratingsToInput(ratings),
  }
}

// Scored movies only, oldest first-score (or migrated lock time) first.
// movie_elo replays the array in order and does not look at week numbers.
export function rankedMovieInputs(): WeekInput[] {
  return listMovies()
    .filter((movie) => movie.ratingCount > 0)
    .map((movie) => {
      const ratings = getRatings(movie.id)
      return { id: movie.id, input: movieToInput(movie, ratings) }
    })
    .sort((a, b) => {
      const byTime = (a.input.ranked_at ?? "").localeCompare(b.input.ranked_at ?? "")
      if (byTime !== 0) return byTime
      return a.id - b.id
    })
    .map((item) => item.input)
}

export function memberNames(): string[] {
  return listUsers().map((user) => user.name)
}

export function loadLeague(): { league: LeagueView | null; error: string | null } {
  const members = memberNames()
  if (members.length === 0) return { league: null, error: null }
  try {
    return {
      league: computeLeague({ members, weeks: rankedMovieInputs() }),
      error: null,
    }
  } catch (error) {
    const message =
      error instanceof RankingError || error instanceof Error ? error.message : "The ranking engine failed."
    return { league: null, error: message }
  }
}
