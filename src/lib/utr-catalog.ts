// Read-only views for Movies and Rankings. Scores come from the current lists.
// Pick impact is the stored fromNew on that movie's close. Nothing here writes.

import { getDb } from "@/lib/db"
import { utrBoard, utrCloses } from "@/lib/utr"
import { UTR_BUCKETS, bandScore, type UtrBucket } from "@/lib/utr-score"
import type { UtrRank } from "@/lib/utr-ranks"

const STARTING_RANK: UtrRank = { tier: "Silver", division: "II", label: "Silver II" }

export type UtrPersonRole = "rated" | "skipped" | "waiting" | "done"

export type UtrMoviePerson = {
  userId: number
  name: string
  rank: UtrRank
  role: UtrPersonRole
  bucket: UtrBucket | null
  score: number | null
  suggester: boolean
}

export type UtrMovieCard = {
  id: number
  title: string
  status: "open" | "closed"
  suggestedAt: string
  suggesterName: string
  suggesterRank: UtrRank
  revealed: boolean
  groupScore: number | null
  ratingCount: number
  people: UtrMoviePerson[]
}

export type UtrSuggestedPick = {
  movieId: number
  title: string
  status: "open" | "closed"
  suggestedAt: string
  groupScore: number | null
  ratingCount: number
  revealed: boolean
  impact: number | null
}

export type UtrSuggesterPicks = {
  picks: UtrSuggestedPick[]
  picksNet: number
  reSorted: number
}

type MovieRow = {
  id: number
  title: string
  suggester_id: number
  suggester_name: string
  suggested_at: string
  status: "open" | "closed"
}

type ResponseRow = {
  movie_id: number
  user_id: number
  kind: "rate" | "skip"
  bucket: string | null
}

type ListRow = {
  user_id: number
  movie_id: number
  bucket: UtrBucket
  position: number
}

type Placed = { bucket: UtrBucket; score: number }

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function isBucket(value: string | null): value is UtrBucket {
  return value === "a_lot" || value === "kinda" || value === "not_really"
}

function currentPlacements(rows: ListRow[]): Map<number, Map<number, Placed>> {
  const grouped = new Map<number, Record<UtrBucket, { movieId: number; position: number }[]>>()
  for (const row of rows) {
    let lists = grouped.get(row.user_id)
    if (!lists) {
      lists = { a_lot: [], kinda: [], not_really: [] }
      grouped.set(row.user_id, lists)
    }
    lists[row.bucket].push({ movieId: row.movie_id, position: row.position })
  }
  const placed = new Map<number, Map<number, Placed>>()
  for (const [userId, lists] of grouped) {
    const mine = new Map<number, Placed>()
    for (const bucket of UTR_BUCKETS) {
      const ordered = lists[bucket].sort((a, b) => a.position - b.position)
      ordered.forEach((entry, index) => {
        mine.set(entry.movieId, { bucket, score: bandScore(bucket, index, ordered.length) })
      })
    }
    placed.set(userId, mine)
  }
  return placed
}

function rankFor(ranks: Map<string, UtrRank>, name: string): UtrRank {
  return ranks.get(name) ?? STARTING_RANK
}

function loadRanks(): Map<string, UtrRank> {
  return new Map((utrBoard()?.rows ?? []).map((row) => [row.name, row.rank]))
}

type GroupScore = { score: number | null; count: number }

function groupScoreFor(
  movieId: number,
  suggesterId: number,
  responses: ResponseRow[],
  placed: Map<number, Map<number, Placed>>,
): GroupScore {
  const scores: number[] = []
  for (const response of responses) {
    if (response.movie_id !== movieId || response.kind !== "rate" || response.user_id === suggesterId) continue
    const score = placed.get(response.user_id)?.get(movieId)?.score
    if (score == null) continue
    scores.push(score)
  }
  if (scores.length === 0) return { score: null, count: 0 }
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return { score: round1(mean), count: scores.length }
}

function namesById(db = getDb()): Map<number, string> {
  return new Map(
    (db.prepare("SELECT id, name FROM users").all() as { id: number; name: string }[]).map((row) => [row.id, row.name]),
  )
}

export function utrMovieFeed(viewerId: number): UtrMovieCard[] {
  const db = getDb()
  const movies = db
    .prepare(
      `SELECT utr_movies.id, utr_movies.title, utr_movies.suggester_id, users.name AS suggester_name,
              utr_movies.suggested_at, utr_movies.status
       FROM utr_movies
       JOIN users ON users.id = utr_movies.suggester_id
       ORDER BY CASE utr_movies.status WHEN 'open' THEN 0 ELSE 1 END,
                utr_movies.suggested_at DESC,
                utr_movies.id DESC`,
    )
    .all() as MovieRow[]
  const responses = db
    .prepare("SELECT movie_id, user_id, kind, bucket FROM utr_responses")
    .all() as ResponseRow[]
  const lists = db
    .prepare("SELECT user_id, movie_id, bucket, position FROM utr_lists")
    .all() as ListRow[]
  const active = db
    .prepare("SELECT user_id FROM utr_members WHERE active = 1")
    .all() as { user_id: number }[]
  const names = namesById(db)
  const placed = currentPlacements(lists)
  const ranks = loadRanks()
  const answeredByViewer = new Set(
    responses.filter((row) => row.user_id === viewerId).map((row) => row.movie_id),
  )

  return movies.map((movie) => {
    const revealed = movie.status === "closed" || answeredByViewer.has(movie.id)
    const group = groupScoreFor(movie.id, movie.suggester_id, responses, placed)
    const movieResponses = responses.filter((row) => row.movie_id === movie.id)
    const answeredIds = new Set(movieResponses.map((row) => row.user_id))
    const people: UtrMoviePerson[] = []

    for (const response of movieResponses) {
      const name = names.get(response.user_id) ?? "Member"
      const spot = placed.get(response.user_id)?.get(movie.id) ?? null
      const suggester = response.user_id === movie.suggester_id
      if (!revealed) {
        people.push({
          userId: response.user_id,
          name,
          rank: rankFor(ranks, name),
          role: "done",
          bucket: null,
          score: null,
          suggester: false,
        })
        continue
      }
      if (response.kind === "skip") {
        people.push({
          userId: response.user_id,
          name,
          rank: rankFor(ranks, name),
          role: "skipped",
          bucket: null,
          score: null,
          suggester,
        })
        continue
      }
      people.push({
        userId: response.user_id,
        name,
        rank: rankFor(ranks, name),
        role: "rated",
        bucket: spot?.bucket ?? (isBucket(response.bucket) ? response.bucket : null),
        score: spot?.score ?? null,
        suggester,
      })
    }

    if (movie.status === "open") {
      for (const member of active) {
        if (answeredIds.has(member.user_id)) continue
        const name = names.get(member.user_id) ?? "Member"
        people.push({
          userId: member.user_id,
          name,
          rank: rankFor(ranks, name),
          role: "waiting",
          bucket: null,
          score: null,
          suggester: false,
        })
      }
    }

    people.sort((a, b) => {
      const aw = a.role === "waiting" ? 1 : 0
      const bw = b.role === "waiting" ? 1 : 0
      if (aw !== bw) return aw - bw
      return a.name.localeCompare(b.name)
    })

    return {
      id: movie.id,
      title: movie.title,
      status: movie.status,
      suggestedAt: movie.suggested_at,
      suggesterName: movie.suggester_name,
      suggesterRank: rankFor(ranks, movie.suggester_name),
      revealed,
      groupScore: revealed ? group.score : null,
      ratingCount: revealed ? group.count : 0,
      people,
    }
  })
}

export function utrPicksBySuggester(viewerId: number): Map<string, UtrSuggesterPicks> {
  const db = getDb()
  const movies = db
    .prepare(
      `SELECT utr_movies.id, utr_movies.title, utr_movies.suggester_id, users.name AS suggester_name,
              utr_movies.suggested_at, utr_movies.status
       FROM utr_movies
       JOIN users ON users.id = utr_movies.suggester_id
       ORDER BY utr_movies.suggested_at DESC, utr_movies.id DESC`,
    )
    .all() as MovieRow[]
  const responses = db
    .prepare("SELECT movie_id, user_id, kind, bucket FROM utr_responses")
    .all() as ResponseRow[]
  const lists = db
    .prepare("SELECT user_id, movie_id, bucket, position FROM utr_lists")
    .all() as ListRow[]
  const placed = currentPlacements(lists)
  const answeredByViewer = new Set(
    responses.filter((row) => row.user_id === viewerId).map((row) => row.movie_id),
  )
  const closes = utrCloses()
  const closeByMovie = new Map(closes.map((close) => [close.movieId, close]))
  const reSortedByName = new Map<string, number>()
  for (const close of closes) {
    for (const [name, value] of Object.entries(close.fromOlder)) {
      reSortedByName.set(name, (reSortedByName.get(name) ?? 0) + value)
    }
  }

  const byName = new Map<string, UtrSuggesterPicks>()
  for (const movie of movies) {
    const revealed = movie.status === "closed" || answeredByViewer.has(movie.id)
    const group = groupScoreFor(movie.id, movie.suggester_id, responses, placed)
    const close = closeByMovie.get(movie.id)
    const impact = movie.status === "open" ? null : (close?.fromNew[movie.suggester_name] ?? 0)
    let entry = byName.get(movie.suggester_name)
    if (!entry) {
      entry = { picks: [], picksNet: 0, reSorted: reSortedByName.get(movie.suggester_name) ?? 0 }
      byName.set(movie.suggester_name, entry)
    }
    entry.picks.push({
      movieId: movie.id,
      title: movie.title,
      status: movie.status,
      suggestedAt: movie.suggested_at,
      groupScore: revealed ? group.score : null,
      ratingCount: revealed ? group.count : 0,
      revealed,
      impact,
    })
    if (impact != null) entry.picksNet += impact
  }
  return byName
}
