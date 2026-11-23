// Personal taste lists. Three enjoyment groups, best first inside each group.
// Scores use the Beli bands. No "too tough": every comparison picks a side.

export const UTR_BUCKETS = ["a_lot", "kinda", "not_really"] as const
export type UtrBucket = (typeof UTR_BUCKETS)[number]

export const UTR_BUCKET_LABELS: Record<UtrBucket, string> = {
  a_lot: "Loved it",
  kinda: "Just ok",
  not_really: "Didn't like it",
}

const BELI_BUCKET = { a_lot: "liked", kinda: "fine", not_really: "disliked" } as const

const BAND = {
  a_lot: { lo: 70, hi: 100, baseline: 85 },
  kinda: { lo: 40, hi: 69, baseline: 55 },
  not_really: { lo: 0, hi: 39, baseline: 20 },
} as const

export type UtrAnswer = "new" | "old" | "back"

export type UtrSearch = {
  movieId: number
  bucket: UtrBucket
  candidates: number[]
  lo: number
  hi: number
  history: [number, number][]
  answers: UtrAnswer[]
}

export function isUtrBucket(value: string): value is UtrBucket {
  return (UTR_BUCKETS as readonly string[]).includes(value)
}

export function questionBudget(alreadyInBucket: number): number {
  if (alreadyInBucket <= 0) return 0
  return Math.ceil(Math.log2(alreadyInBucket + 1))
}

export function startSearch(movieId: number, bucket: UtrBucket, candidates: number[]): UtrSearch {
  return { movieId, bucket, candidates: [...candidates], lo: 0, hi: candidates.length, history: [], answers: [] }
}

export function searchDone(search: UtrSearch): boolean {
  return search.lo >= search.hi
}

export function questionsLeft(search: UtrSearch): number {
  if (searchDone(search)) return 0
  return Math.ceil(Math.log2(search.hi - search.lo + 1))
}

export function pivotIndex(search: UtrSearch): number {
  if (searchDone(search)) throw new Error("the position is already decided")
  return Math.floor((search.lo + search.hi) / 2)
}

export function answerSearch(search: UtrSearch, choice: UtrAnswer): UtrSearch {
  if (choice === "back") {
    if (search.history.length === 0) return search
    const previous = search.history[search.history.length - 1]
    return {
      ...search,
      lo: previous[0],
      hi: previous[1],
      history: search.history.slice(0, -1),
      answers: search.answers.slice(0, -1),
    }
  }
  if (choice !== "new" && choice !== "old") {
    throw new Error("choose the new movie or the one already on the list")
  }
  if (searchDone(search)) throw new Error("the position is already decided")
  const mid = Math.floor((search.lo + search.hi) / 2)
  const history: [number, number][] = [...search.history, [search.lo, search.hi]]
  const answers: UtrAnswer[] = [...search.answers, choice]
  if (choice === "new") return { ...search, hi: mid, history, answers }
  return { ...search, lo: mid + 1, history, answers }
}

// Half-up to one decimal, in tenths, matching movie_beli.score.
export function bandScore(bucket: UtrBucket, position: number, size: number): number {
  const band = BAND[bucket]
  if (size < 1 || position < 0 || position >= size) {
    throw new Error(`position ${position} is outside a group of ${size}`)
  }
  if (size === 1) return band.baseline / 10
  const denom = size - 1
  const raw = band.hi * denom - (band.hi - band.lo) * position
  const tenths = Math.floor((raw + Math.floor(denom / 2)) / denom)
  return tenths / 10
}

export function scoresForBucket(bucket: UtrBucket, movieIds: number[]): Map<number, number> {
  const scores = new Map<number, number>()
  movieIds.forEach((movieId, position) => {
    scores.set(movieId, bandScore(bucket, position, movieIds.length))
  })
  return scores
}

export function beliBucketName(bucket: UtrBucket): (typeof BELI_BUCKET)[UtrBucket] {
  return BELI_BUCKET[bucket]
}

export function bucketFromLegacy(raw: string): UtrBucket | null {
  if (raw === "liked" || raw === "a_lot") return "a_lot"
  if (raw === "fine" || raw === "kinda") return "kinda"
  if (raw === "disliked" || raw === "not_really") return "not_really"
  return null
}

export function bucketForBlended(score: number): UtrBucket {
  if (score >= 7) return "a_lot"
  if (score >= 4) return "kinda"
  return "not_really"
}
