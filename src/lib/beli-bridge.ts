import { spawnSync } from "node:child_process"
import path from "node:path"

// Mirrors ranking.ts for scripts/beli_bridge.py. Kept separate so the Elo
// bridge stays untouched.

export const BELI_BUCKETS = ["liked", "fine", "disliked"] as const
export type BeliBucket = (typeof BELI_BUCKETS)[number]
export const BELI_BUCKET_LABELS: Record<BeliBucket, string> = {
  liked: "Liked",
  fine: "Fine",
  disliked: "Didn't like",
}

export const BELI_ANSWERS = ["new", "old", "too_tough", "back"] as const
export type BeliAnswer = (typeof BELI_ANSWERS)[number]

export type BeliLists = Record<BeliBucket, string[]>

// Rankings.to_dict() shape: names and titles only, never ids.
export type BeliState = {
  members: string[]
  movies: { title: string; submitted_by: string }[]
  lists: Record<string, BeliLists>
}

// Insertion.to_dict(); stored verbatim in beli_pending.state.
export type BeliInsertion = {
  member: string
  movie: string
  bucket: BeliBucket
  candidates: string[]
  lo: number
  hi: number
  history: [number, number][]
  rerank: boolean
}

export type BeliRankedRow = { rank: number; movie: string; bucket: BeliBucket; score: number }
export type BeliMovieView = {
  title: string
  submitted_by: string
  community_score: number | null
  scores: { member: string; bucket: BeliBucket; score: number }[]
}
export type BeliLeaderboardRow = { member: string; value: number | null; submitted: number; ranked: number }

export type BeliViewResult = {
  my_list: BeliRankedRow[]
  rankable: { title: string; submitted_by: string }[]
  movies: BeliMovieView[]
  leaderboard: BeliLeaderboardRow[]
}

export type BeliStepResult =
  | { done: false; insertion: BeliInsertion; pivot: string; questions_left: number }
  | { done: true; lists: BeliLists; index: number }

type BridgeErr = { ok: false; error: string; type: string }

export class BeliBridgeError extends Error {
  // movie_beli exception class name, or "bridge" when the process itself failed.
  type: string

  constructor(message: string, type = "bridge") {
    super(message)
    this.name = "BeliBridgeError"
    this.type = type
  }
}

function call<T>(payload: Record<string, unknown>): T {
  const python = process.env.PYTHON ?? "python3"
  const script = path.join(process.cwd(), "scripts", "beli_bridge.py")
  const result = spawnSync(python, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  })

  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === "ENOENT"
    throw new BeliBridgeError(
      missing
        ? "Python 3 is required to run the movie_beli ranking engine, and it was not found on PATH."
        : `The Beli engine failed to start: ${result.error.message}`,
    )
  }

  const stdout = result.stdout?.trim() ?? ""
  if (!stdout) {
    throw new BeliBridgeError(
      `The Beli engine returned no output (exit ${result.status}). ${result.stderr ?? ""}`.trim(),
    )
  }

  let parsed: (T & { ok: true }) | BridgeErr
  try {
    parsed = JSON.parse(stdout) as (T & { ok: true }) | BridgeErr
  } catch {
    throw new BeliBridgeError(`The Beli engine returned invalid JSON. ${result.stderr ?? ""}`.trim())
  }

  if (!parsed.ok) {
    throw new BeliBridgeError(parsed.error, parsed.type)
  }
  return parsed
}

export function beliView(state: BeliState, member: string): BeliViewResult {
  return call<BeliViewResult>({ command: "view", state, member })
}

export function beliStart(
  state: BeliState,
  member: string,
  title: string,
  bucket: BeliBucket,
  rerank: boolean,
): BeliStepResult {
  return call<BeliStepResult>({ command: "start", state, member, title, bucket, rerank })
}

export function beliStep(state: BeliState, insertion: BeliInsertion, answer: BeliAnswer | null): BeliStepResult {
  return call<BeliStepResult>({ command: "step", state, insertion, answer })
}

export function beliRemove(state: BeliState, member: string, title: string): { lists: BeliLists } {
  return call<{ lists: BeliLists }>({ command: "remove", state, member, title })
}
