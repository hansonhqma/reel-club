import type { RatingEvent } from "@/lib/rating-events"
import { nextClose, type EloMap, type Member, type Movie } from "@/lib/utr-elo"
import {
  answerSearch,
  bandScore,
  isUtrBucket,
  searchDone,
  startSearch,
  UTR_BUCKETS,
  type UtrBucket,
  type UtrSearch,
} from "@/lib/utr-score"

type ReplayMovie = Movie & { status: "open" | "closed" }
type ResponseRec = { kind: "rate" | "skip"; bucket: UtrBucket | null; answers: string[] }

export type UtrReplay = {
  members: (Member & { active: boolean })[]
  movies: ReplayMovie[]
  lists: Map<number, Record<UtrBucket, number[]>>
  responses: Map<string, ResponseRec>
  pending: Map<number, UtrSearch>
  closes: { movieId: number; elo: EloMap; fromNew: EloMap; fromOlder: EloMap }[]
}

function listsFor(model: UtrReplay, userId: number): Record<UtrBucket, number[]> {
  let lists = model.lists.get(userId)
  if (!lists) {
    lists = { a_lot: [], kinda: [], not_really: [] }
    model.lists.set(userId, lists)
  }
  return lists
}

function removeMovie(model: UtrReplay, userId: number, movieId: number): void {
  const lists = listsFor(model, userId)
  for (const bucket of UTR_BUCKETS) lists[bucket] = lists[bucket].filter((id) => id !== movieId)
}

function scoresOf(model: UtrReplay): Map<number, Map<number, number>> {
  const scores = new Map<number, Map<number, number>>()
  for (const [userId, lists] of model.lists) {
    const mine = new Map<number, number>()
    for (const bucket of UTR_BUCKETS) {
      lists[bucket].forEach((movieId, position) => mine.set(movieId, bandScore(bucket, position, lists[bucket].length)))
    }
    scores.set(userId, mine)
  }
  return scores
}

function snapshotNewCloses(model: UtrReplay): void {
  const members = model.members.map(({ id, name }) => ({ id, name }))
  const closed = model.movies.filter((movie) => movie.status === "closed").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const done = new Set(model.closes.map((row) => row.movieId))
  const scores = scoresOf(model)
  let previous: EloMap | null = model.closes.length ? model.closes[model.closes.length - 1].elo : null
  const seen: Movie[] = []
  for (const movie of closed) {
    if (done.has(movie.id)) {
      seen.push(movie)
      continue
    }
    const result = nextClose(members, seen, movie, scores, previous)
    model.closes.push({ movieId: movie.id, elo: result.elo, fromNew: result.fromNew, fromOlder: result.fromOlder })
    previous = result.elo
    seen.push(movie)
  }
}

function responseKey(movieId: number, userId: number): string {
  return `${movieId}:${userId}`
}

export function replayUtr(events: RatingEvent[]): UtrReplay {
  const model: UtrReplay = {
    members: [],
    movies: [],
    lists: new Map(),
    responses: new Map(),
    pending: new Map(),
    closes: [],
  }

  const place = (userId: number, movieId: number, bucket: UtrBucket, index: number, answers: string[]) => {
    removeMovie(model, userId, movieId)
    const lists = listsFor(model, userId)
    const next = [...lists[bucket]]
    next.splice(index, 0, movieId)
    lists[bucket] = next
    model.pending.delete(userId)
    model.responses.set(responseKey(movieId, userId), { kind: "rate", bucket, answers })
  }

  for (const event of events) {
    const payload = event.payload
    if (event.type === "member.joined") {
      const id = Number(payload.userId)
      if (!model.members.some((member) => member.id === id)) {
        model.members.push({ id, name: String(payload.name), active: true })
        model.members.sort((a, b) => a.id - b.id)
        listsFor(model, id)
      }
      continue
    }
    if (!event.type.startsWith("utr.")) continue

    if (event.type === "utr.member.left") {
      const member = model.members.find((item) => item.id === Number(payload.userId))
      if (member) member.active = false
      continue
    }
    if (event.type === "utr.movie.seeded" || event.type === "utr.movie.suggested") {
      const id = event.movieId
      if (id == null) throw new Error(`${event.type} is missing movie_id`)
      model.movies.push({
        id,
        title: String(payload.title),
        suggesterId: Number(payload.suggesterId),
        seq: event.type === "utr.movie.seeded" ? Number(payload.seq) : 0,
        status: event.type === "utr.movie.seeded" ? "closed" : "open",
      })
      continue
    }
    if (event.type === "utr.list.seeded") {
      const userId = Number(payload.userId)
      const entries = payload.entries as { movieId: number; bucket: UtrBucket }[]
      const lists = listsFor(model, userId)
      for (const entry of entries) {
        lists[entry.bucket].push(entry.movieId)
        model.responses.set(responseKey(entry.movieId, userId), { kind: "rate", bucket: entry.bucket, answers: [] })
      }
      continue
    }
    if (event.type === "utr.seed.closed" || event.type === "utr.movie.closed") {
      if (event.type === "utr.movie.closed" && event.movieId != null) {
        const movie = model.movies.find((item) => item.id === event.movieId)
        if (movie) {
          const seq = model.movies.filter((item) => item.status === "closed" && item.seq > 0).length + 1
          movie.status = "closed"
          movie.seq = seq
        }
        const autoSkipped = (payload.autoSkipped as number[]) ?? []
        for (const userId of autoSkipped) {
          if (event.movieId == null) continue
          removeMovie(model, userId, event.movieId)
          model.pending.delete(userId)
          model.responses.set(responseKey(event.movieId, userId), { kind: "skip", bucket: null, answers: [] })
        }
      }
      snapshotNewCloses(model)
      continue
    }
    if (event.type === "utr.bucket.chosen") {
      const movieId = event.movieId
      if (movieId == null || !isUtrBucket(String(payload.bucket))) throw new Error("bad bucket event")
      const bucket = String(payload.bucket) as UtrBucket
      removeMovie(model, event.actorId, movieId)
      model.responses.delete(responseKey(movieId, event.actorId))
      const candidates = (payload.candidateIds as number[]) ?? listsFor(model, event.actorId)[bucket].filter((id) => id !== movieId)
      model.pending.set(event.actorId, startSearch(movieId, bucket, candidates))
      continue
    }
    if (event.type === "utr.comparison.answered") {
      const pending = model.pending.get(event.actorId)
      if (!pending) throw new Error("replay: comparison without a search")
      model.pending.set(event.actorId, answerSearch(pending, payload.answer as "new" | "old" | "back"))
      continue
    }
    if (event.type === "utr.rating.committed") {
      const pending = model.pending.get(event.actorId)
      const movieId = event.movieId
      if (!pending || movieId == null || !searchDone(pending)) throw new Error("replay: commit without a finished search")
      place(event.actorId, movieId, pending.bucket, pending.lo, pending.answers.filter((answer) => answer !== "back"))
      continue
    }
    if (event.type === "utr.search.restarted" || event.type === "utr.skipped") {
      const movieId = event.movieId
      if (movieId == null) throw new Error(`${event.type} is missing movie_id`)
      removeMovie(model, event.actorId, movieId)
      model.pending.delete(event.actorId)
      if (event.type === "utr.skipped") {
        model.responses.set(responseKey(movieId, event.actorId), { kind: "skip", bucket: null, answers: [] })
      } else {
        model.responses.delete(responseKey(movieId, event.actorId))
      }
      continue
    }
  }

  return model
}
