import { findUserById, listUsers, type PublicUser } from "@/lib/auth"
import {
  BELI_ANSWERS,
  BELI_BUCKETS,
  BeliBridgeError,
  beliRemove,
  beliStart,
  beliStep,
  beliView,
  type BeliAnswer,
  type BeliBucket,
  type BeliInsertion,
  type BeliLeaderboardRow,
  type BeliLists,
  type BeliRankedRow,
  type BeliState,
  type BeliStepResult,
} from "@/lib/beli-bridge"
import { getDb } from "@/lib/db"

// Beli-style personal rankings. Own tables (beli_*), own movie list, nothing
// shared with the Elo flow in club.ts beyond users. SQLite stores each member's
// ordered lists; movie_beli (through beli-bridge.ts) does every placement and
// every score.

export class BeliError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "BeliError"
    this.code = code
  }
}

export type BeliMovie = {
  id: number
  title: string
  submitterId: number
  submitterName: string
  submittedAt: string
}

export type BeliPending = {
  movieId: number
  insertion: BeliInsertion
  startedAt: string
}

export type BeliView = {
  myList: (BeliRankedRow & { movieId: number })[]
  rankable: BeliMovie[]
  movies: (BeliMovie & {
    communityScore: number | null
    scores: { member: string; bucket: BeliBucket; score: number }[]
  })[]
  leaderboard: BeliLeaderboardRow[]
}

type MovieRow = {
  id: number
  title: string
  submitter_id: number
  submitter_name: string
  submitted_at: string
}

const MOVIE_SELECT = `
  SELECT beli_movies.id, beli_movies.title, beli_movies.submitter_id, beli_movies.submitted_at,
         users.name AS submitter_name
  FROM beli_movies
  JOIN users ON users.id = beli_movies.submitter_id
`

function mapMovie(row: MovieRow): BeliMovie {
  return {
    id: row.id,
    title: row.title,
    submitterId: row.submitter_id,
    submitterName: row.submitter_name,
    submittedAt: row.submitted_at,
  }
}

export function listBeliMovies(): BeliMovie[] {
  const rows = getDb().prepare(`${MOVIE_SELECT} ORDER BY beli_movies.id ASC`).all() as MovieRow[]
  return rows.map(mapMovie)
}

export function getBeliMovie(id: number): BeliMovie | null {
  const row = getDb().prepare(`${MOVIE_SELECT} WHERE beli_movies.id = ?`).get(id) as MovieRow | undefined
  return row ? mapMovie(row) : null
}

function requireUser(userId: number): PublicUser {
  const row = findUserById(userId)
  if (!row) throw new BeliError("That account is no longer on the list.", "no_user")
  return { id: row.id, username: row.username, name: row.name, isAdmin: row.is_admin === 1 }
}

function requireMovie(raw: unknown): BeliMovie {
  const movieId = typeof raw === "number" ? raw : Number(String(raw ?? "").trim())
  const movie = Number.isInteger(movieId) && movieId > 0 ? getBeliMovie(movieId) : null
  if (!movie) throw new BeliError("That movie isn't on the Beli list.", "no_movie")
  return movie
}

// Same normalisation movie_beli applies (strip), plus collapsed inner spaces so
// the NOCASE UNIQUE index and the library's exact-title key agree. U+0085 (NEL)
// is rejected with the other control characters: Python's str.strip() removes it
// and JS trim() does not, so a title keeping it would not round-trip through the
// engine. It is the only code point the two whitespace sets disagree on.
function cleanTitle(raw: string): string {
  const title = raw.trim().replace(/\s+/g, " ")
  if (title.length < 1 || title.length > 200) {
    throw new BeliError("Give the movie a title, up to 200 characters.", "bad_title")
  }
  if (/[\x00-\x1f\x7f-\x9f]/.test(title)) {
    throw new BeliError("Titles can't contain control characters.", "bad_title")
  }
  return title
}

function parseBucket(raw: unknown): BeliBucket {
  const bucket = String(raw ?? "").trim() as BeliBucket
  if (!BELI_BUCKETS.includes(bucket)) {
    throw new BeliError("Pick Liked, Fine, or Didn't like.", "bad_bucket")
  }
  return bucket
}

function parseAnswer(raw: unknown): BeliAnswer {
  const answer = String(raw ?? "").trim() as BeliAnswer
  if (!BELI_ANSWERS.includes(answer)) {
    throw new BeliError("That answer isn't one of the choices.", "bad_answer")
  }
  return answer
}

export function submitBeliMovie(userId: number, titleRaw: string, opts?: { submittedAt?: string }): BeliMovie {
  const user = requireUser(userId)
  const title = cleanTitle(titleRaw)
  const submittedAt = opts?.submittedAt ?? new Date().toISOString()
  let info
  try {
    info = getDb()
      .prepare("INSERT INTO beli_movies (title, submitter_id, submitted_at) VALUES (?, ?, ?)")
      .run(title, user.id, submittedAt)
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new BeliError("That movie is already on the Beli list.", "duplicate_title")
    }
    throw error
  }
  const saved = getBeliMovie(Number(info.lastInsertRowid))
  if (!saved) throw new BeliError("The submission didn't save.", "submit_failed")
  return saved
}

// Rankings.to_dict() built from the tables. Names and titles only; ids are
// translated back with idByTitle when the engine answers.
function loadState(): { state: BeliState; idByTitle: Map<string, number> } {
  const members = listUsers()
  const movies = listBeliMovies()
  const idByTitle = new Map(movies.map((movie) => [movie.title, movie.id]))
  const nameById = new Map(members.map((member) => [member.id, member.name]))
  const titleById = new Map(movies.map((movie) => [movie.id, movie.title]))
  const lists: Record<string, BeliLists> = {}
  for (const member of members) lists[member.name] = { liked: [], fine: [], disliked: [] }
  const rows = getDb()
    .prepare("SELECT user_id, movie_id, bucket FROM beli_rankings ORDER BY user_id, bucket, position")
    .all() as { user_id: number; movie_id: number; bucket: BeliBucket }[]
  for (const row of rows) {
    const name = nameById.get(row.user_id)
    const title = titleById.get(row.movie_id)
    // Both lookups always hit: foreign keys are on and beli_movies cascades.
    if (name && title) lists[name][row.bucket].push(title)
  }
  return {
    state: {
      members: members.map((member) => member.name),
      movies: movies.map((movie) => ({ title: movie.title, submitted_by: movie.submitterName })),
      lists,
    },
    idByTitle,
  }
}

// Where the member currently has this movie, without spawning the engine.
export function getBeliPlacement(userId: number, movieId: number): { bucket: BeliBucket; position: number } | null {
  const row = getDb()
    .prepare("SELECT bucket, position FROM beli_rankings WHERE user_id = ? AND movie_id = ?")
    .get(userId, movieId) as { bucket: BeliBucket; position: number } | undefined
  return row ?? null
}

export function getBeliPending(userId: number): BeliPending | null {
  const row = getDb()
    .prepare("SELECT movie_id, state, started_at FROM beli_pending WHERE user_id = ?")
    .get(userId) as { movie_id: number; state: string; started_at: string } | undefined
  if (!row) return null
  return { movieId: row.movie_id, insertion: JSON.parse(row.state) as BeliInsertion, startedAt: row.started_at }
}

// Identifies the pending row a form was rendered against. Empty when nothing
// is in progress. started_at plus the search position, so a second submit of
// the same question no longer matches after the first one lands.
export function beliStepToken(pending: BeliPending | null): string {
  if (!pending) return ""
  const { bucket, lo, hi, history } = pending.insertion
  return [pending.movieId, pending.startedAt, bucket, lo, hi, history.length].join(":")
}

const STALE_STEP =
  "That step was already submitted. Refresh and continue from the current question."

function assertCurrentStep(userId: number, token: string): BeliPending | null {
  const pending = getBeliPending(userId)
  if (beliStepToken(pending) !== token) throw new BeliError(STALE_STEP, "stale_step")
  return pending
}

export type OtherBeliPending = {
  movieId: number
  title: string
  bucket: BeliBucket
}

// A search for a different movie than the one this page is showing.
export function otherBeliPending(userId: number, movieId: number): OtherBeliPending | null {
  const pending = getBeliPending(userId)
  if (!pending || pending.movieId === movieId) return null
  const movie = getBeliMovie(pending.movieId)
  if (!movie) return null
  return { movieId: movie.id, title: movie.title, bucket: pending.insertion.bucket }
}

export function cancelBeliRanking(userId: number): void {
  getDb().prepare("DELETE FROM beli_pending WHERE user_id = ?").run(userId)
}

// Replaces the member's rows with the lists the engine returned. First-placed
// time survives a re-rank; positions are the list indexes.
function writeLists(userId: number, lists: BeliLists, idByTitle: Map<string, number>): void {
  const db = getDb()
  const now = new Date().toISOString()
  const old = new Map(
    (
      db.prepare("SELECT movie_id, ranked_at FROM beli_rankings WHERE user_id = ?").all(userId) as {
        movie_id: number
        ranked_at: string
      }[]
    ).map((row) => [row.movie_id, row.ranked_at]),
  )
  db.prepare("DELETE FROM beli_rankings WHERE user_id = ?").run(userId)
  const insert = db.prepare(
    `INSERT INTO beli_rankings (user_id, movie_id, bucket, position, ranked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const bucket of BELI_BUCKETS) {
    lists[bucket].forEach((title, position) => {
      const movieId = idByTitle.get(title)
      if (movieId == null) throw new BeliError(`The engine returned an unknown title: ${title}`, "bad_engine_title")
      insert.run(userId, movieId, bucket, position, old.get(movieId) ?? now, now)
    })
  }
}

function applyStep(
  userId: number,
  movieId: number,
  result: BeliStepResult,
  idByTitle: Map<string, number>,
  fresh: boolean,
): BeliStepResult {
  const db = getDb()
  const apply = db.transaction(() => {
    if (result.done) {
      writeLists(userId, result.lists, idByTitle)
      db.prepare("DELETE FROM beli_pending WHERE user_id = ?").run(userId)
    } else if (fresh) {
      db.prepare(
        "INSERT OR REPLACE INTO beli_pending (user_id, movie_id, state, started_at) VALUES (?, ?, ?, ?)",
      ).run(userId, movieId, JSON.stringify(result.insertion), new Date().toISOString())
    } else {
      db.prepare("UPDATE beli_pending SET state = ? WHERE user_id = ? AND movie_id = ?").run(
        JSON.stringify(result.insertion),
        userId,
        movieId,
      )
    }
  })
  apply()
  return result
}

// Picks a bucket and begins the binary search. `token` is the pending row the
// form was rendered against. A matching search for this movie and bucket is
// resumed; anything else whose token still matches replaces that search. A
// movie the member already placed is re-ranked: the old placement stays until
// the search finishes.
export function startBeliRanking(
  userId: number,
  movieIdRaw: unknown,
  bucketRaw: unknown,
  token: string,
): BeliStepResult {
  const user = requireUser(userId)
  const movie = requireMovie(movieIdRaw)
  const bucket = parseBucket(bucketRaw)
  if (movie.submitterId === user.id) {
    throw new BeliError("You submitted this one, so you don't rank it. Others decide where it lands.", "own_submission")
  }
  const pending = assertCurrentStep(user.id, token)
  if (pending && pending.movieId === movie.id && pending.insertion.bucket === bucket) {
    return stepPending(user, movie, null)
  }
  const { state, idByTitle } = loadState()
  const rerank = BELI_BUCKETS.some((b) => state.lists[user.name]?.[b].includes(movie.title))
  const result = beliStart(state, user.name, movie.title, bucket, rerank)
  return applyStep(user.id, movie.id, result, idByTitle, true)
}

function requirePending(userId: number, movieId: number): BeliPending {
  const pending = getBeliPending(userId)
  if (!pending || pending.movieId !== movieId) {
    throw new BeliError("There's no ranking in progress for this movie. Pick a bucket to start.", "no_pending")
  }
  return pending
}

function stepPending(user: PublicUser, movie: BeliMovie, answer: BeliAnswer | null): BeliStepResult {
  const pending = requirePending(user.id, movie.id)
  const { state, idByTitle } = loadState()
  let result: BeliStepResult
  try {
    result = beliStep(state, pending.insertion, answer)
  } catch (error) {
    // A stale or malformed search can't be continued; drop it so the member can start again.
    if (error instanceof BeliBridgeError && error.type !== "bridge") cancelBeliRanking(user.id)
    throw error
  }
  return applyStep(user.id, movie.id, result, idByTitle, false)
}

// Answers the current "which did you like more?" question. When the search
// ends, the movie is placed in one transaction and the pending row is removed.
export function answerBeliRanking(
  userId: number,
  movieIdRaw: unknown,
  answerRaw: unknown,
  token: string,
): BeliStepResult {
  const user = requireUser(userId)
  const movie = requireMovie(movieIdRaw)
  assertCurrentStep(user.id, token)
  const answer = parseAnswer(answerRaw)
  return stepPending(user, movie, answer)
}

// The current question for a resumable search, or null when none is pending
// for this movie. A stored search that is already finished gets placed.
export function peekBeliRanking(userId: number, movieIdRaw: unknown): BeliStepResult | null {
  const user = requireUser(userId)
  const movie = requireMovie(movieIdRaw)
  const pending = getBeliPending(user.id)
  if (!pending || pending.movieId !== movie.id) return null
  return stepPending(user, movie, null)
}

export function removeBeliRanking(userId: number, movieIdRaw: unknown): void {
  const user = requireUser(userId)
  const movie = requireMovie(movieIdRaw)
  const placement = getBeliPlacement(user.id, movie.id)
  // A second click finds nothing left to remove.
  if (!placement) return
  const pending = getBeliPending(user.id)
  const dropPending =
    pending != null &&
    (pending.movieId === movie.id || pending.insertion.bucket === placement.bucket)
  const { state, idByTitle } = loadState()
  const { lists } = beliRemove(state, user.name, movie.title)
  const db = getDb()
  const apply = db.transaction(() => {
    writeLists(user.id, lists, idByTitle)
    if (dropPending) db.prepare("DELETE FROM beli_pending WHERE user_id = ?").run(user.id)
  })
  apply()
}

export function beliRankingCount(movieId: number): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM beli_rankings WHERE movie_id = ?").get(movieId) as {
    c: number
  }
  return row.c
}

// Unranked: the submitter or an admin. Ranked: an admin, and only with confirm,
// because the delete cascades through everyone's placements.
export function deleteBeliMovie(userId: number, movieIdRaw: unknown, opts?: { confirm?: boolean }): void {
  const user = requireUser(userId)
  const movie = requireMovie(movieIdRaw)
  const ranked = beliRankingCount(movie.id) > 0
  if (ranked) {
    if (!user.isAdmin) {
      throw new BeliError("Only an admin can remove a movie people have ranked.", "forbidden")
    }
    if (!opts?.confirm) {
      throw new BeliError("Confirm removing this movie for the whole club.", "confirm_delete")
    }
  } else if (movie.submitterId !== user.id && !user.isAdmin) {
    throw new BeliError("Only the person who added this, or an admin, can remove it.", "forbidden")
  }
  getDb().prepare("DELETE FROM beli_movies WHERE id = ?").run(movie.id)
}

export function getBeliView(userId: number): BeliView {
  const user = requireUser(userId)
  const { state } = loadState()
  const byTitle = new Map(listBeliMovies().map((movie) => [movie.title, movie]))
  const movieOf = (title: string): BeliMovie => {
    const movie = byTitle.get(title)
    if (!movie) throw new BeliError(`The engine returned an unknown title: ${title}`, "bad_engine_title")
    return movie
  }
  const view = beliView(state, user.name)
  return {
    myList: view.my_list.map((row) => ({ ...row, movieId: movieOf(row.movie).id })),
    rankable: view.rankable.map((movie) => movieOf(movie.title)),
    movies: view.movies.map((movie) => ({
      ...movieOf(movie.title),
      communityScore: movie.community_score,
      scores: movie.scores,
    })),
    leaderboard: view.leaderboard,
  }
}

// Page-friendly wrapper, like loadLeague(): an engine failure becomes a message.
export function loadBeliView(userId: number): { view: BeliView | null; error: string | null } {
  try {
    return { view: getBeliView(userId), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Beli engine failed."
    return { view: null, error: message }
  }
}
