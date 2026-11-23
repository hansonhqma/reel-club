import type Database from "better-sqlite3"
import { findUserById, type PublicUser } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { appendRatingEvent, type RatingEventInput } from "@/lib/rating-events"
import { recordUtrCloses } from "@/lib/utr-elo"
import { rankSnapshots, type UtrRank } from "@/lib/utr-ranks"
import {
  answerSearch,
  bandScore,
  isUtrBucket,
  pivotIndex,
  questionBudget,
  questionsLeft,
  searchDone,
  startSearch,
  type UtrBucket,
  type UtrSearch,
} from "@/lib/utr-score"

export class UtrError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "UtrError"
    this.code = code
  }
}

export type UtrMovie = {
  id: number
  title: string
  suggesterId: number
  suggesterName: string
  suggestedAt: string
  status: "open" | "closed"
  closedAt: string | null
  closeReason: "complete" | "early" | "seed" | null
  seq: number | null
}

type MovieRow = {
  id: number
  title: string
  suggester_id: number
  suggester_name: string
  suggested_at: string
  status: "open" | "closed"
  closed_at: string | null
  close_reason: "complete" | "early" | "seed" | null
  seq: number | null
}

const MOVIE_SQL = `
  SELECT utr_movies.id, utr_movies.title, utr_movies.suggester_id, users.name AS suggester_name,
         utr_movies.suggested_at, utr_movies.status, utr_movies.closed_at, utr_movies.close_reason, utr_movies.seq
  FROM utr_movies
  JOIN users ON users.id = utr_movies.suggester_id
`

function mapMovie(row: MovieRow): UtrMovie {
  return {
    id: row.id,
    title: row.title,
    suggesterId: row.suggester_id,
    suggesterName: row.suggester_name,
    suggestedAt: row.suggested_at,
    status: row.status,
    closedAt: row.closed_at,
    closeReason: row.close_reason,
    seq: row.seq,
  }
}

function requireUser(userId: number): PublicUser {
  const row = findUserById(userId)
  if (!row) throw new UtrError("That account is no longer on the list.", "no_user")
  return { id: row.id, username: row.username, name: row.name, isAdmin: row.is_admin === 1 }
}

function activeIds(db: Database.Database): number[] {
  return (db.prepare("SELECT user_id FROM utr_members WHERE active = 1 ORDER BY user_id ASC").all() as { user_id: number }[]).map(
    (row) => row.user_id,
  )
}

function requireActive(db: Database.Database, userId: number): void {
  const row = db.prepare("SELECT active FROM utr_members WHERE user_id = ?").get(userId) as { active: number } | undefined
  if (!row || row.active !== 1) throw new UtrError("You are not rating with the club right now.", "inactive")
}

function cleanTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ")
  if (title.length < 1 || title.length > 200) throw new UtrError("Give the movie a title, up to 200 characters.", "bad_title")
  if (/[\x00-\x1f\x7f-\x9f]/.test(title)) throw new UtrError("Titles can't contain control characters.", "bad_title")
  return title
}

export function getOpenUtrMovie(): UtrMovie | null {
  const row = getDb().prepare(`${MOVIE_SQL} WHERE utr_movies.status = 'open'`).get() as MovieRow | undefined
  return row ? mapMovie(row) : null
}

export function getUtrMovie(id: number): UtrMovie | null {
  const row = getDb().prepare(`${MOVIE_SQL} WHERE utr_movies.id = ?`).get(id) as MovieRow | undefined
  return row ? mapMovie(row) : null
}

function requireOpen(movieId: number): UtrMovie {
  const movie = getUtrMovie(movieId)
  if (!movie || movie.status !== "open") throw new UtrError("That movie is not open for ratings.", "not_open")
  return movie
}

function bucketIds(db: Database.Database, userId: number, bucket: UtrBucket, exceptMovieId?: number): number[] {
  const rows = db
    .prepare(
      `SELECT movie_id FROM utr_lists
       WHERE user_id = ? AND bucket = ? AND movie_id != ?
       ORDER BY position ASC`,
    )
    .all(userId, bucket, exceptMovieId ?? -1) as { movie_id: number }[]
  return rows.map((row) => row.movie_id)
}

function writeBucket(db: Database.Database, userId: number, bucket: UtrBucket, movieIds: number[]): void {
  db.prepare("DELETE FROM utr_lists WHERE user_id = ? AND bucket = ?").run(userId, bucket)
  const insert = db.prepare("INSERT INTO utr_lists (user_id, movie_id, bucket, position) VALUES (?, ?, ?, ?)")
  movieIds.forEach((movieId, position) => insert.run(userId, movieId, bucket, position))
}

function removeFromLists(db: Database.Database, userId: number, movieId: number): void {
  const row = db.prepare("SELECT bucket FROM utr_lists WHERE user_id = ? AND movie_id = ?").get(userId, movieId) as
    | { bucket: UtrBucket }
    | undefined
  if (!row) return
  const rest = bucketIds(db, userId, row.bucket, movieId)
  writeBucket(db, userId, row.bucket, rest)
}

function readSearch(db: Database.Database, userId: number, movieId: number): UtrSearch | null {
  const row = db.prepare("SELECT state FROM utr_pending WHERE user_id = ? AND movie_id = ?").get(userId, movieId) as
    | { state: string }
    | undefined
  return row ? (JSON.parse(row.state) as UtrSearch) : null
}

function log(db: Database.Database, event: RatingEventInput): void {
  appendRatingEvent(db, event)
}

function closeMovie(
  db: Database.Database,
  movie: UtrMovie,
  actorId: number,
  reason: "complete" | "early",
  autoSkipped: number[],
): void {
  const seq = ((db.prepare("SELECT COALESCE(MAX(seq), 0) AS n FROM utr_movies").get() as { n: number }).n) + 1
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE utr_movies SET status = 'closed', closed_at = ?, close_reason = ?, seq = ? WHERE id = ?`,
  ).run(now, reason, seq, movie.id)
  db.prepare("DELETE FROM utr_pending WHERE movie_id = ?").run(movie.id)
  recordUtrCloses(db)
  log(db, {
    actorId,
    type: "utr.movie.closed",
    movieId: movie.id,
    occurredAt: now,
    payload: { movieId: movie.id, title: movie.title, reason, autoSkipped },
  })
}

export function suggestUtrMovie(userId: number, titleRaw: string): UtrMovie {
  const user = requireUser(userId)
  const title = cleanTitle(titleRaw)
  const db = getDb()
  return db.transaction(() => {
    requireActive(db, user.id)
    const open = db.prepare("SELECT id, title FROM utr_movies WHERE status = 'open'").get() as
      | { id: number; title: string }
      | undefined
    if (open) throw new UtrError(`Finish ${open.title} before suggesting another movie.`, "movie_open")
    const now = new Date().toISOString()
    const info = db
      .prepare(
        `INSERT INTO utr_movies (title, suggester_id, suggested_at, status) VALUES (?, ?, ?, 'open')`,
      )
      .run(title, user.id, now)
    const movieId = Number(info.lastInsertRowid)
    log(db, {
      actorId: user.id,
      type: "utr.movie.suggested",
      movieId,
      occurredAt: now,
      payload: { title, suggesterId: user.id },
    })
    const saved = getUtrMovie(movieId)
    if (!saved) throw new UtrError("The suggestion didn't save.", "suggest_failed")
    return saved
  })()
}

export type UtrStep =
  | { done: false; bucket: UtrBucket; pivotMovieId: number; pivotTitle: string; questionsLeft: number; historyLength: number }
  | { done: true; bucket: UtrBucket; score: number }

function stepFromSearch(db: Database.Database, search: UtrSearch): UtrStep {
  if (searchDone(search)) return { done: true, bucket: search.bucket, score: 0 }
  const pivotMovieId = search.candidates[pivotIndex(search)]
  const pivot = db.prepare("SELECT title FROM utr_movies WHERE id = ?").get(pivotMovieId) as { title: string }
  return {
    done: false,
    bucket: search.bucket,
    pivotMovieId,
    pivotTitle: pivot?.title ?? "",
    questionsLeft: questionsLeft(search),
    historyLength: search.history.length,
  }
}

function commitSearch(db: Database.Database, userId: number, movie: UtrMovie, search: UtrSearch, now: string): number {
  if (!searchDone(search)) throw new UtrError("The comparisons are not finished.", "search_open")
  removeFromLists(db, userId, movie.id)
  const ids = bucketIds(db, userId, search.bucket, movie.id)
  ids.splice(search.lo, 0, movie.id)
  writeBucket(db, userId, search.bucket, ids)
  db.prepare("DELETE FROM utr_pending WHERE user_id = ?").run(userId)
  db.prepare(
    `INSERT INTO utr_responses (movie_id, user_id, kind, bucket, answers, updated_at)
     VALUES (?, ?, 'rate', ?, ?, ?)
     ON CONFLICT(movie_id, user_id) DO UPDATE SET
       kind = 'rate', bucket = excluded.bucket, answers = excluded.answers, updated_at = excluded.updated_at`,
  ).run(movie.id, userId, search.bucket, JSON.stringify(search.answers.filter((answer) => answer !== "back")), now)
  return ids.indexOf(movie.id)
}

export function startUtrRating(userId: number, movieId: number, bucketRaw: string): UtrStep {
  const user = requireUser(userId)
  if (!isUtrBucket(bucketRaw)) throw new UtrError("Enjoyment is Didn't like it, Just ok, or Loved it.", "bad_bucket")
  const bucket = bucketRaw
  const db = getDb()
  return db.transaction(() => {
    requireActive(db, user.id)
    const movie = requireOpen(movieId)
    const now = new Date().toISOString()
    removeFromLists(db, user.id, movie.id)
    db.prepare("DELETE FROM utr_responses WHERE movie_id = ? AND user_id = ?").run(movie.id, user.id)
    const candidates = bucketIds(db, user.id, bucket, movie.id)
    const search = startSearch(movie.id, bucket, candidates)
    log(db, {
      actorId: user.id,
      type: "utr.bucket.chosen",
      movieId: movie.id,
      occurredAt: now,
      payload: { movieId: movie.id, title: movie.title, bucket, candidateIds: candidates },
    })
    if (searchDone(search)) {
      const index = commitSearch(db, user.id, movie, search, now)
      log(db, {
        actorId: user.id,
        type: "utr.rating.committed",
        movieId: movie.id,
        payload: { movieId: movie.id, title: movie.title, bucket, answers: [], index },
      })
      const placed = bucketIds(db, user.id, bucket)
      return { done: true as const, bucket, score: placed.length ? scoreAt(bucket, placed.indexOf(movie.id), placed.length) : 0 }
    }
    db.prepare(
      `INSERT INTO utr_pending (user_id, movie_id, state, started_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET movie_id = excluded.movie_id, state = excluded.state, started_at = excluded.started_at`,
    ).run(user.id, movie.id, JSON.stringify(search), now)
    return stepFromSearch(db, search)
  })()
}

function scoreAt(bucket: UtrBucket, position: number, size: number): number {
  return bandScore(bucket, position, size)
}

export function answerUtrRating(userId: number, movieId: number, answerRaw: string, historyLength?: number): UtrStep {
  const user = requireUser(userId)
  if (answerRaw !== "new" && answerRaw !== "old" && answerRaw !== "back") {
    throw new UtrError("Choose the new movie or the one already on the list.", "bad_answer")
  }
  const db = getDb()
  return db.transaction(() => {
    requireActive(db, user.id)
    const movie = requireOpen(movieId)
    const search = readSearch(db, user.id, movie.id)
    if (!search) throw new UtrError("Pick how much you enjoyed it before comparing.", "no_search")
    if (historyLength != null && historyLength !== search.history.length) {
      throw new UtrError("That comparison was already answered. Refresh and continue.", "stale_step")
    }
    const next = answerSearch(search, answerRaw)
    const now = new Date().toISOString()
    log(db, {
      actorId: user.id,
      type: "utr.comparison.answered",
      movieId: movie.id,
      occurredAt: now,
      payload: { movieId: movie.id, title: movie.title, bucket: search.bucket, answer: answerRaw },
    })
    if (searchDone(next)) {
      const index = commitSearch(db, user.id, movie, next, now)
      log(db, {
        actorId: user.id,
        type: "utr.rating.committed",
        movieId: movie.id,
        payload: {
          movieId: movie.id,
          title: movie.title,
          bucket: next.bucket,
          answers: next.answers.filter((answer) => answer !== "back"),
          index,
        },
      })
      const placed = bucketIds(db, user.id, next.bucket)
      return {
        done: true as const,
        bucket: next.bucket,
        score: scoreAt(next.bucket, placed.indexOf(movie.id), placed.length),
      }
    }
    db.prepare("UPDATE utr_pending SET state = ? WHERE user_id = ?").run(JSON.stringify(next), user.id)
    return stepFromSearch(db, next)
  })()
}

export function restartUtrRating(userId: number, movieId: number): void {
  const user = requireUser(userId)
  const db = getDb()
  db.transaction(() => {
    requireActive(db, user.id)
    const movie = requireOpen(movieId)
    removeFromLists(db, user.id, movie.id)
    db.prepare("DELETE FROM utr_pending WHERE user_id = ? AND movie_id = ?").run(user.id, movie.id)
    db.prepare("DELETE FROM utr_responses WHERE movie_id = ? AND user_id = ?").run(movie.id, user.id)
    log(db, {
      actorId: user.id,
      type: "utr.search.restarted",
      movieId: movie.id,
      payload: { movieId: movie.id, title: movie.title },
    })
  })()
}

export function skipUtrMovie(userId: number, movieId: number): void {
  const user = requireUser(userId)
  const db = getDb()
  db.transaction(() => {
    requireActive(db, user.id)
    const movie = requireOpen(movieId)
    const now = new Date().toISOString()
    removeFromLists(db, user.id, movie.id)
    db.prepare("DELETE FROM utr_pending WHERE user_id = ?").run(user.id)
    db.prepare(
      `INSERT INTO utr_responses (movie_id, user_id, kind, bucket, answers, updated_at)
       VALUES (?, ?, 'skip', NULL, '[]', ?)
       ON CONFLICT(movie_id, user_id) DO UPDATE SET
         kind = 'skip', bucket = NULL, answers = '[]', updated_at = excluded.updated_at`,
    ).run(movie.id, user.id, now)
    log(db, {
      actorId: user.id,
      type: "utr.skipped",
      movieId: movie.id,
      occurredAt: now,
      payload: { movieId: movie.id, title: movie.title },
    })
  })()
}

export function closeUtrMovie(userId: number, movieId: number): void {
  const user = requireUser(userId)
  const db = getDb()
  db.transaction(() => {
    const movie = requireOpen(movieId)
    if (movie.suggesterId !== user.id && !user.isAdmin) {
      throw new UtrError("Only the suggester or an admin can close ratings.", "forbidden")
    }
    const now = new Date().toISOString()
    const active = activeIds(db)
    const answered = new Set(
      (db.prepare("SELECT user_id FROM utr_responses WHERE movie_id = ?").all(movie.id) as { user_id: number }[]).map(
        (row) => row.user_id,
      ),
    )
    const autoSkipped: number[] = []
    for (const id of active) {
      if (answered.has(id)) continue
      autoSkipped.push(id)
      removeFromLists(db, id, movie.id)
      db.prepare("DELETE FROM utr_pending WHERE user_id = ? AND movie_id = ?").run(id, movie.id)
      db.prepare(
        `INSERT INTO utr_responses (movie_id, user_id, kind, bucket, answers, updated_at)
         VALUES (?, ?, 'skip', NULL, '[]', ?)
         ON CONFLICT(movie_id, user_id) DO UPDATE SET kind = 'skip', bucket = NULL, answers = '[]', updated_at = excluded.updated_at`,
      ).run(movie.id, id, now)
      log(db, {
        actorId: id,
        type: "utr.skipped",
        movieId: movie.id,
        occurredAt: now,
        payload: { movieId: movie.id, title: movie.title, automatic: true },
      })
    }
    closeMovie(db, movie, user.id, autoSkipped.length === 0 ? "complete" : "early", autoSkipped)
  })()
}

export function leaveUtrClub(userId: number): void {
  const user = requireUser(userId)
  const db = getDb()
  db.transaction(() => {
    db.prepare("UPDATE utr_members SET active = 0 WHERE user_id = ?").run(user.id)
    log(db, { actorId: user.id, type: "utr.member.left", payload: { userId: user.id } })
  })()
}

export type UtrListRow = {
  movieId: number
  title: string
  bucket: UtrBucket
  position: number
  score: number
  rank: number
}

export function utrList(userId: number): UtrListRow[] {
  const rows = getDb()
    .prepare(
      `SELECT utr_lists.movie_id, utr_movies.title, utr_lists.bucket, utr_lists.position
       FROM utr_lists
       JOIN utr_movies ON utr_movies.id = utr_lists.movie_id
       WHERE utr_lists.user_id = ?
       ORDER BY CASE utr_lists.bucket WHEN 'a_lot' THEN 0 WHEN 'kinda' THEN 1 ELSE 2 END,
                utr_lists.position ASC`,
    )
    .all(userId) as { movie_id: number; title: string; bucket: UtrBucket; position: number }[]
  const sizes: Record<UtrBucket, number> = { a_lot: 0, kinda: 0, not_really: 0 }
  for (const row of rows) sizes[row.bucket] += 1
  return rows.map((row, index) => ({
    movieId: row.movie_id,
    title: row.title,
    bucket: row.bucket,
    position: row.position,
    score: bandScore(row.bucket, row.position, sizes[row.bucket]),
    rank: index + 1,
  }))
}

export function utrPending(userId: number, movieId: number): UtrStep | null {
  const search = readSearch(getDb(), userId, movieId)
  if (!search) return null
  return stepFromSearch(getDb(), search)
}

export type UtrCloseView = {
  movieId: number
  title: string
  seq: number
  elo: Record<string, number>
  fromNew: Record<string, number>
  fromOlder: Record<string, number>
  ranks: Record<string, UtrRank>
  ratedPicks: Record<string, number>
}

export type UtrBoardRow = {
  name: string
  elo: number
  fromNew: number
  fromOlder: number
  rank: UtrRank
  ratedPicks: number
}

export function utrCloses(): UtrCloseView[] {
  const rows = getDb()
    .prepare(
      `SELECT utr_closes.movie_id, utr_movies.title, utr_movies.suggester_id, utr_closes.seq,
              utr_closes.elo_json, utr_closes.from_new_json, utr_closes.from_older_json, utr_closes.scores_json
       FROM utr_closes
       JOIN utr_movies ON utr_movies.id = utr_closes.movie_id
       ORDER BY utr_closes.seq ASC`,
    )
    .all() as {
    movie_id: number
    title: string
    suggester_id: number
    seq: number
    elo_json: string
    from_new_json: string
    from_older_json: string
    scores_json: string
  }[]
  const names = new Map(
    (getDb().prepare("SELECT id, name FROM users").all() as { id: number; name: string }[]).map((row) => [row.id, row.name]),
  )
  const byName = (json: string) => {
    const raw = JSON.parse(json) as Record<string, number>
    const out: Record<string, number> = {}
    for (const [id, value] of Object.entries(raw)) out[names.get(Number(id)) ?? id] = value
    return out
  }
  const byId = (json: string) => {
    const raw = JSON.parse(json) as Record<string, number>
    const out: Record<number, number> = {}
    for (const [id, value] of Object.entries(raw)) out[Number(id)] = value
    return out
  }
  const scoresOf = (json: string) => {
    const raw = JSON.parse(json) as Record<string, Record<string, number>>
    const scores = new Map<number, Map<number, number>>()
    for (const [userId, mine] of Object.entries(raw)) {
      const inner = new Map<number, number>()
      for (const [movieId, value] of Object.entries(mine)) inner.set(Number(movieId), value)
      scores.set(Number(userId), inner)
    }
    return scores
  }
  const snaps = rankSnapshots(
    rows.map((row) => ({
      movieId: row.movie_id,
      suggesterId: row.suggester_id,
      elo: byId(row.elo_json),
      scores: scoresOf(row.scores_json),
    })),
    names,
  )
  return rows.map((row, index) => {
    const ranks: Record<string, UtrRank> = {}
    const ratedPicks: Record<string, number> = {}
    for (const [id, rank] of Object.entries(snaps[index].ranks)) {
      ranks[names.get(Number(id)) ?? id] = rank
    }
    for (const [id, count] of Object.entries(snaps[index].ratedPicks)) {
      ratedPicks[names.get(Number(id)) ?? id] = count
    }
    return {
      movieId: row.movie_id,
      title: row.title,
      seq: row.seq,
      elo: byName(row.elo_json),
      fromNew: byName(row.from_new_json),
      fromOlder: byName(row.from_older_json),
      ranks,
      ratedPicks,
    }
  })
}

export function utrBoard(): { movieId: number; title: string; seq: number; rows: UtrBoardRow[] } | null {
  const latest = utrCloses().at(-1)
  if (!latest) return null
  const rows = Object.keys(latest.elo).map((name) => ({
    name,
    elo: latest.elo[name],
    fromNew: latest.fromNew[name] ?? 0,
    fromOlder: latest.fromOlder[name] ?? 0,
    rank: latest.ranks[name],
    ratedPicks: latest.ratedPicks[name] ?? 0,
  }))
  rows.sort((a, b) => b.elo - a.elo || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { movieId: latest.movieId, title: latest.title, seq: latest.seq, rows }
}

export function questionBudgetFor(userId: number, bucket: UtrBucket): number {
  return questionBudget(bucketIds(getDb(), userId, bucket).length)
}
