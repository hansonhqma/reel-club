import type Database from "better-sqlite3"
import {
  BELI_BUCKETS,
  beliRemove,
  beliStart,
  beliStep,
  type BeliBucket,
  type BeliInsertion,
  type BeliLists,
  type BeliState,
} from "@/lib/beli-bridge"
import type { WeekInput } from "@/lib/ranking"

// Append-only log of actions that affect ratings or rankings. Sequence id is
// the replay order. occurred_at is the time the row was written and is not
// consulted by replay. See docs/rating-events.md.

export const RATING_EVENT_SCHEMA_VERSION = 1
export const RATING_EVENTS_MIGRATION = 2

export const RATING_EVENT_TYPES = [
  "member.joined",
  "elo.movie.suggested",
  "elo.movie.removed",
  "elo.rating.set",
  "elo.rating.changed",
  "beli.movie.submitted",
  "beli.movie.deleted",
  "beli.bucket.chosen",
  "beli.comparison.answered",
  "beli.ranking.placed",
  "beli.list.removed",
  "beli.search.started",
  "beli.search.resumed",
  "beli.search.abandoned",
] as const

export type RatingEventType = (typeof RATING_EVENT_TYPES)[number]

export const RATING_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS rating_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  movie_id INTEGER,
  other_id INTEGER,
  payload TEXT NOT NULL,
  backfilled INTEGER NOT NULL DEFAULT 0 CHECK (backfilled IN (0, 1))
);
`

export type RatingEvent = {
  id: number
  occurredAt: string
  actorId: number
  type: RatingEventType
  schemaVersion: number
  movieId: number | null
  otherId: number | null
  backfilled: boolean
  payload: Record<string, unknown>
}

type EventRow = {
  id: number
  occurred_at: string
  actor_id: number
  event_type: string
  schema_version: number
  movie_id: number | null
  other_id: number | null
  payload: string
  backfilled: number
}

export type RatingEventInput = {
  actorId: number
  type: RatingEventType
  movieId?: number | null
  otherId?: number | null
  payload: Record<string, unknown>
  occurredAt?: string
  backfilled?: boolean
}

function assertType(type: string): asserts type is RatingEventType {
  if (!(RATING_EVENT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unknown rating event type ${type}`)
  }
}

// Object keys are stored in sorted order. Arrays keep their order.
export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = canonicalize(source[key])
    }
    return out
  }
  return value
}

export function appendRatingEvent(db: Database.Database, event: RatingEventInput): number {
  assertType(event.type)
  const info = db
    .prepare(
      `INSERT INTO rating_events (
         occurred_at, actor_id, event_type, schema_version, movie_id, other_id, payload, backfilled
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.occurredAt ?? new Date().toISOString(),
      event.actorId,
      event.type,
      RATING_EVENT_SCHEMA_VERSION,
      event.movieId ?? null,
      event.otherId ?? null,
      stableJson(event.payload),
      event.backfilled ? 1 : 0,
    )
  return Number(info.lastInsertRowid)
}

function mapEvent(row: EventRow): RatingEvent {
  assertType(row.event_type)
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    type: row.event_type,
    schemaVersion: row.schema_version,
    movieId: row.movie_id,
    otherId: row.other_id,
    backfilled: row.backfilled === 1,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  }
}

export function readRatingEvents(db: Database.Database): RatingEvent[] {
  const rows = db
    .prepare(
      `SELECT id, occurred_at, actor_id, event_type, schema_version, movie_id, other_id, payload, backfilled
       FROM rating_events
       ORDER BY id ASC`,
    )
    .all() as EventRow[]
  return rows.map(mapEvent)
}

export function ratingEventsJsonl(db: Database.Database): string {
  const events = readRatingEvents(db)
  if (events.length === 0) return ""
  return events.map((event) => stableJson(event)).join("\n") + "\n"
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

// When two backfilled events share a timestamp, lower priority is written first
// so a join precedes a movie and a movie precedes its ratings and placements.
const BACKFILL_KIND_PRIORITY: Record<RatingEventType, number> = {
  "member.joined": 0,
  "elo.movie.suggested": 1,
  "beli.movie.submitted": 2,
  "elo.rating.set": 3,
  "beli.ranking.placed": 4,
  "beli.search.started": 5,
  "elo.rating.changed": 6,
  "elo.movie.removed": 7,
  "beli.bucket.chosen": 8,
  "beli.search.resumed": 9,
  "beli.comparison.answered": 10,
  "beli.list.removed": 11,
  "beli.search.abandoned": 12,
  "beli.movie.deleted": 13,
}

type BackfillDraft = RatingEventInput & {
  sortAt: string
  kind: number
  sourceId: number
}

function timeValue(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

// The later of two timestamps. Equal instants keep the one already chosen so a
// clamped event can share its dependency's stored text.
function laterTimestamp(current: string, candidate: string | undefined): string {
  if (!candidate) return current
  return timeValue(current) >= timeValue(candidate) ? current : candidate
}

// One-time synthetic history. Events are interleaved by their real timestamp,
// not grouped by table. Comparison steps that already finished are not in the
// tables, so those events cannot be invented.
export function backfillRatingEvents(db: Database.Database): void {
  if (!tableExists(db, "schema_migrations")) return
  const already = db.prepare("SELECT 1 AS ok FROM schema_migrations WHERE version = ?").get(RATING_EVENTS_MIGRATION)
  if (already) return

  const tx = db.transaction(() => {
    const drafts: BackfillDraft[] = []
    const joinedAt = new Map<number, string>()

    if (tableExists(db, "users")) {
      const users = db
        .prepare(
          `SELECT id, username, name, is_admin, created_at
           FROM users
           ORDER BY id ASC`,
        )
        .all() as { id: number; username: string; name: string; is_admin: number; created_at: string }[]
      for (const user of users) {
        joinedAt.set(user.id, user.created_at)
        drafts.push({
          sortAt: user.created_at,
          kind: BACKFILL_KIND_PRIORITY["member.joined"],
          sourceId: user.id,
          actorId: user.id,
          type: "member.joined",
          backfilled: true,
          payload: {
            userId: user.id,
            username: user.username,
            name: user.name,
            isAdmin: user.is_admin === 1,
            via: "backfill",
          },
        })
      }
    }

    const eloMovieAt = new Map<number, string>()
    if (tableExists(db, "movies")) {
      const movies = db
        .prepare(
          `SELECT id, movie, suggester_id, suggested_at, note, ranked_at
           FROM movies
           ORDER BY id ASC`,
        )
        .all() as {
        id: number
        movie: string
        suggester_id: number
        suggested_at: string
        note: string | null
        ranked_at: string | null
      }[]
      for (const movie of movies) {
        const sortAt = laterTimestamp(movie.suggested_at, joinedAt.get(movie.suggester_id))
        eloMovieAt.set(movie.id, sortAt)
        drafts.push({
          sortAt,
          kind: BACKFILL_KIND_PRIORITY["elo.movie.suggested"],
          sourceId: movie.id,
          actorId: movie.suggester_id,
          type: "elo.movie.suggested",
          movieId: movie.id,
          backfilled: true,
          payload: {
            title: movie.movie,
            note: movie.note,
            suggestedAt: movie.suggested_at,
            suggesterId: movie.suggester_id,
            rankedAt: movie.ranked_at,
          },
        })
      }
    }

    if (tableExists(db, "ratings")) {
      const ratings = db
        .prepare(
          `SELECT id, movie_id, user_id, experience, quality, created_at, updated_at
           FROM ratings
           ORDER BY id ASC`,
        )
        .all() as {
        id: number
        movie_id: number
        user_id: number
        experience: number
        quality: number
        created_at: string
        updated_at: string
      }[]
      for (const rating of ratings) {
        const sortAt = laterTimestamp(
          laterTimestamp(rating.created_at, eloMovieAt.get(rating.movie_id)),
          joinedAt.get(rating.user_id),
        )
        drafts.push({
          sortAt,
          kind: BACKFILL_KIND_PRIORITY["elo.rating.set"],
          sourceId: rating.id,
          actorId: rating.user_id,
          type: "elo.rating.set",
          movieId: rating.movie_id,
          backfilled: true,
          payload: {
            experience: rating.experience,
            quality: rating.quality,
            at: rating.created_at,
            updatedAt: rating.updated_at,
          },
        })
      }
    }

    const beliTitles = new Map<number, string>()
    const beliMovieAt = new Map<number, string>()
    if (tableExists(db, "beli_movies")) {
      const movies = db
        .prepare(
          `SELECT id, title, submitter_id, submitted_at
           FROM beli_movies
           ORDER BY id ASC`,
        )
        .all() as { id: number; title: string; submitter_id: number; submitted_at: string }[]
      for (const movie of movies) {
        beliTitles.set(movie.id, movie.title)
        const sortAt = laterTimestamp(movie.submitted_at, joinedAt.get(movie.submitter_id))
        beliMovieAt.set(movie.id, sortAt)
        drafts.push({
          sortAt,
          kind: BACKFILL_KIND_PRIORITY["beli.movie.submitted"],
          sourceId: movie.id,
          actorId: movie.submitter_id,
          type: "beli.movie.submitted",
          movieId: movie.id,
          backfilled: true,
          payload: {
            title: movie.title,
            submittedAt: movie.submitted_at,
            submitterId: movie.submitter_id,
          },
        })
      }
    }

    if (tableExists(db, "beli_rankings")) {
      const rows = db
        .prepare(
          `SELECT user_id, movie_id, bucket, position, ranked_at, updated_at
           FROM beli_rankings
           ORDER BY movie_id ASC, user_id ASC`,
        )
        .all() as {
        user_id: number
        movie_id: number
        bucket: string
        position: number
        ranked_at: string
        updated_at: string
      }[]
      for (const row of rows) {
        const sortAt = laterTimestamp(
          laterTimestamp(row.ranked_at, beliMovieAt.get(row.movie_id)),
          joinedAt.get(row.user_id),
        )
        drafts.push({
          sortAt,
          kind: BACKFILL_KIND_PRIORITY["beli.ranking.placed"],
          sourceId: row.movie_id,
          actorId: row.user_id,
          type: "beli.ranking.placed",
          movieId: row.movie_id,
          backfilled: true,
          payload: {
            movieId: row.movie_id,
            title: beliTitles.get(row.movie_id) ?? null,
            bucket: row.bucket,
            position: row.position,
            rankedAt: row.ranked_at,
            updatedAt: row.updated_at,
            snapshot: true,
          },
        })
      }
    }

    if (tableExists(db, "beli_pending")) {
      const rows = db
        .prepare(
          `SELECT user_id, movie_id, state, started_at
           FROM beli_pending
           ORDER BY user_id ASC`,
        )
        .all() as { user_id: number; movie_id: number; state: string; started_at: string }[]
      for (const row of rows) {
        const insertion = JSON.parse(row.state) as BeliInsertion
        const sortAt = laterTimestamp(
          laterTimestamp(row.started_at, beliMovieAt.get(row.movie_id)),
          joinedAt.get(row.user_id),
        )
        drafts.push({
          sortAt,
          kind: BACKFILL_KIND_PRIORITY["beli.search.started"],
          sourceId: row.user_id,
          actorId: row.user_id,
          type: "beli.search.started",
          movieId: row.movie_id,
          backfilled: true,
          payload: {
            movieId: row.movie_id,
            title: beliTitles.get(row.movie_id) ?? insertion.movie,
            bucket: insertion.bucket,
            startedAt: row.started_at,
            snapshot: true,
            insertion,
          },
        })
      }
    }

    drafts.sort((a, b) => {
      const byTime = timeValue(a.sortAt) - timeValue(b.sortAt)
      if (byTime !== 0) return byTime
      if (a.kind !== b.kind) return a.kind - b.kind
      if (a.sourceId !== b.sourceId) return a.sourceId - b.sourceId
      return a.actorId - b.actorId
    })
    for (const draft of drafts) {
      appendRatingEvent(db, { ...draft, occurredAt: draft.sortAt })
    }

    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      RATING_EVENTS_MIGRATION,
      new Date().toISOString(),
    )
  })
  tx()
}

type MemberRec = { id: number; username: string; name: string; isAdmin: boolean }
type EloMovieRec = {
  id: number
  title: string
  suggesterId: number
  suggestedAt: string
  note: string | null
  rankedAt: string | null
}
type EloRatingRec = {
  movieId: number
  userId: number
  experience: number
  quality: number
  createdAt: string
  updatedAt: string
}
type BeliMovieRec = { id: number; title: string; submitterId: number; submittedAt: string }
type PendingRec = { movieId: number; insertion: BeliInsertion; startedAt: string }

export type RebuiltClub = {
  members: MemberRec[]
  eloMovies: EloMovieRec[]
  eloRatings: EloRatingRec[]
  beliMovies: BeliMovieRec[]
  beliLists: Map<number, Record<BeliBucket, number[]>>
  beliPending: Map<number, PendingRec>
}

function emptyLists(): Record<BeliBucket, number[]> {
  return { liked: [], fine: [], disliked: [] }
}

function asRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return payload
}

function num(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`rating event payload is missing ${label}`)
  }
  return value
}

function str(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`rating event payload is missing ${label}`)
  return value
}

function beliTitle(model: RebuiltClub, movieId: number): string {
  const movie = model.beliMovies.find((item) => item.id === movieId)
  if (!movie) throw new Error(`replay: unknown beli movie ${movieId}`)
  return movie.title
}

function memberName(model: RebuiltClub, userId: number): string {
  const member = model.members.find((item) => item.id === userId)
  if (!member) throw new Error(`replay: unknown member ${userId}`)
  return member.name
}

function listsFor(model: RebuiltClub, userId: number): Record<BeliBucket, number[]> {
  let lists = model.beliLists.get(userId)
  if (!lists) {
    lists = emptyLists()
    model.beliLists.set(userId, lists)
  }
  return lists
}

function denseIds(ids: number[]): number[] {
  const out: number[] = []
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]
    if (id != null) out.push(id)
  }
  return out
}

export function beliStateFromModel(model: RebuiltClub): BeliState {
  const members = model.members.map((member) => member.name)
  const nameById = new Map(model.members.map((member) => [member.id, member.name]))
  const movies = [...model.beliMovies]
    .sort((a, b) => a.id - b.id)
    .map((movie) => ({
      title: movie.title,
      submitted_by: nameById.get(movie.submitterId) ?? "",
    }))
  const lists: Record<string, BeliLists> = {}
  for (const member of model.members) {
    const stored = model.beliLists.get(member.id) ?? emptyLists()
    lists[member.name] = {
      liked: denseIds(stored.liked).map((id) => beliTitle(model, id)),
      fine: denseIds(stored.fine).map((id) => beliTitle(model, id)),
      disliked: denseIds(stored.disliked).map((id) => beliTitle(model, id)),
    }
  }
  return { members, movies, lists }
}

function applyBeliLists(model: RebuiltClub, userId: number, lists: BeliLists): void {
  const next = emptyLists()
  for (const bucket of BELI_BUCKETS) {
    next[bucket] = lists[bucket].map((title) => {
      const movie = model.beliMovies.find((item) => item.title === title)
      if (!movie) throw new Error(`replay: engine returned unknown title ${title}`)
      return movie.id
    })
  }
  model.beliLists.set(userId, next)
}

function rememberPending(model: RebuiltClub, userId: number, movieId: number, insertion: BeliInsertion, startedAt: string) {
  model.beliPending.set(userId, { movieId, insertion, startedAt })
}

// Rebuilds stored club state from events in the order given. Callers pass
// events already sorted by id. This function does not sort, read the clock,
// or iterate object keys to decide order.
export function reduceRatingEvents(events: RatingEvent[]): RebuiltClub {
  const model: RebuiltClub = {
    members: [],
    eloMovies: [],
    eloRatings: [],
    beliMovies: [],
    beliLists: new Map(),
    beliPending: new Map(),
  }

  for (const event of events) {
    const payload = asRecord(event.payload)
    switch (event.type) {
      case "member.joined": {
        const id = num(payload.userId, "userId")
        model.members.push({
          id,
          username: str(payload.username, "username"),
          name: str(payload.name, "name"),
          isAdmin: payload.isAdmin === true,
        })
        model.members.sort((a, b) => a.id - b.id)
        listsFor(model, id)
        break
      }
      case "elo.movie.suggested": {
        const id = event.movieId
        if (id == null) throw new Error("elo.movie.suggested is missing movie_id")
        model.eloMovies.push({
          id,
          title: str(payload.title, "title"),
          suggesterId: num(payload.suggesterId, "suggesterId"),
          suggestedAt: str(payload.suggestedAt, "suggestedAt"),
          note: payload.note == null ? null : str(payload.note, "note"),
          rankedAt: payload.rankedAt == null ? null : str(payload.rankedAt, "rankedAt"),
        })
        break
      }
      case "elo.movie.removed": {
        const id = event.movieId
        if (id == null) throw new Error("elo.movie.removed is missing movie_id")
        model.eloMovies = model.eloMovies.filter((movie) => movie.id !== id)
        model.eloRatings = model.eloRatings.filter((rating) => rating.movieId !== id)
        break
      }
      case "elo.rating.set": {
        const movieId = event.movieId
        if (movieId == null) throw new Error("elo.rating.set is missing movie_id")
        const at = str(payload.at, "at")
        model.eloRatings.push({
          movieId,
          userId: event.actorId,
          experience: num(payload.experience, "experience"),
          quality: num(payload.quality, "quality"),
          createdAt: at,
          updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : at,
        })
        const movie = model.eloMovies.find((item) => item.id === movieId)
        if (movie && movie.rankedAt == null) movie.rankedAt = at
        break
      }
      case "elo.rating.changed": {
        const movieId = event.movieId
        if (movieId == null) throw new Error("elo.rating.changed is missing movie_id")
        const rating = model.eloRatings.find((item) => item.movieId === movieId && item.userId === event.actorId)
        if (!rating) throw new Error(`replay: no rating to change for movie ${movieId}`)
        rating.experience = num(payload.experience, "experience")
        rating.quality = num(payload.quality, "quality")
        rating.updatedAt = str(payload.at, "at")
        break
      }
      case "beli.movie.submitted": {
        const id = event.movieId
        if (id == null) throw new Error("beli.movie.submitted is missing movie_id")
        model.beliMovies.push({
          id,
          title: str(payload.title, "title"),
          submitterId: num(payload.submitterId, "submitterId"),
          submittedAt: str(payload.submittedAt, "submittedAt"),
        })
        break
      }
      case "beli.movie.deleted": {
        const id = event.movieId
        if (id == null) throw new Error("beli.movie.deleted is missing movie_id")
        model.beliMovies = model.beliMovies.filter((movie) => movie.id !== id)
        for (const lists of model.beliLists.values()) {
          for (const bucket of BELI_BUCKETS) lists[bucket] = lists[bucket].filter((movieId) => movieId !== id)
        }
        for (const [userId, pending] of model.beliPending) {
          if (pending.movieId === id) model.beliPending.delete(userId)
        }
        break
      }
      case "beli.bucket.chosen":
        break
      case "beli.search.started": {
        const movieId = event.movieId
        if (movieId == null) throw new Error("beli.search.started is missing movie_id")
        if (event.backfilled) {
          rememberPending(
            model,
            event.actorId,
            movieId,
            payload.insertion as BeliInsertion,
            str(payload.startedAt, "startedAt"),
          )
          break
        }
        const result = beliStart(
          beliStateFromModel(model),
          memberName(model, event.actorId),
          beliTitle(model, movieId),
          str(payload.bucket, "bucket") as BeliBucket,
          payload.rerank === true,
        )
        model.beliPending.delete(event.actorId)
        if (result.done) applyBeliLists(model, event.actorId, result.lists)
        else rememberPending(model, event.actorId, movieId, result.insertion, str(payload.startedAt, "startedAt"))
        break
      }
      case "beli.search.resumed":
      case "beli.comparison.answered": {
        const pending = model.beliPending.get(event.actorId)
        if (!pending) throw new Error(`replay: ${event.type} without a pending search`)
        const answer = event.type === "beli.comparison.answered" ? str(payload.answer, "answer") : null
        const result = beliStep(beliStateFromModel(model), pending.insertion, answer as "new" | "old" | "too_tough" | "back" | null)
        if (result.done) {
          applyBeliLists(model, event.actorId, result.lists)
          model.beliPending.delete(event.actorId)
        } else {
          pending.insertion = result.insertion
        }
        break
      }
      case "beli.ranking.placed": {
        if (!event.backfilled) break
        const movieId = event.movieId
        if (movieId == null) throw new Error("beli.ranking.placed is missing movie_id")
        const bucket = str(payload.bucket, "bucket") as BeliBucket
        const position = num(payload.position, "position")
        const lists = listsFor(model, event.actorId)
        lists[bucket][position] = movieId
        break
      }
      case "beli.list.removed": {
        const movieId = event.movieId
        if (movieId == null) throw new Error("beli.list.removed is missing movie_id")
        const removed = beliRemove(beliStateFromModel(model), memberName(model, event.actorId), beliTitle(model, movieId))
        applyBeliLists(model, event.actorId, removed.lists)
        if (payload.dropPending === true) model.beliPending.delete(event.actorId)
        break
      }
      case "beli.search.abandoned":
        model.beliPending.delete(event.actorId)
        break
      default: {
        const neverType: never = event.type
        throw new Error(`replay: unhandled event ${neverType}`)
      }
    }
  }

  return model
}

function cmpName(a: string, b: string): number {
  const folded = a.toLowerCase().localeCompare(b.toLowerCase())
  if (folded !== 0) return folded
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function eloWeeksFromModel(model: RebuiltClub): { members: string[]; weeks: WeekInput[] } {
  const nameById = new Map(model.members.map((member) => [member.id, member.name]))
  const weeks = model.eloMovies
    .filter((movie) => movie.rankedAt != null && model.eloRatings.some((rating) => rating.movieId === movie.id))
    .map((movie) => {
      const ratings = model.eloRatings
        .filter((rating) => rating.movieId === movie.id)
        .map((rating) => ({
          name: nameById.get(rating.userId) ?? "",
          experience: rating.experience,
          quality: rating.quality,
        }))
        .sort((a, b) => cmpName(a.name, b.name))
      const rankedAt = movie.rankedAt ?? ""
      return {
        id: movie.id,
        input: {
          week_id: String(movie.id),
          suggester: nameById.get(movie.suggesterId) ?? "",
          movie: movie.title,
          date: rankedAt.slice(0, 10),
          ranked_at: rankedAt,
          ratings: Object.fromEntries(ratings.map((rating) => [rating.name, { experience: rating.experience, quality: rating.quality }])),
        } satisfies WeekInput,
      }
    })
    .sort((a, b) => {
      const byTime = (a.input.ranked_at ?? "").localeCompare(b.input.ranked_at ?? "")
      if (byTime !== 0) return byTime
      return a.id - b.id
    })
    .map((item) => item.input)
  return { members: model.members.map((member) => member.name), weeks }
}
