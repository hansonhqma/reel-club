import { spawnSync } from "node:child_process"
import path from "node:path"

export type RatingInput = {
  experience: number
  quality: number
}

export type WeekInput = {
  week_id: string
  suggester: string
  movie: string
  ratings: Record<string, RatingInput>
  date?: string
  // When set, elo_bridge replays events by this timestamp instead of array
  // position or week_id. The app sends the movie's first-score time.
  ranked_at?: string
}

export type JudgeVerdict = {
  judge: string
  weight: number
  new_score: number
  old_score: number
}

export type MatchResult = {
  opponent: string
  opponent_movie: string
  judges: JudgeVerdict[]
  gap: number
  actual: number
  expected: number
  k: number
  delta: number
}

export type WeekResult = {
  week_id: string
  suggester: string
  movie: string
  matches: MatchResult[]
  skipped: Record<string, string>
  voter_credit: Record<string, number>
  deltas: Record<string, number>
  elo_before: Record<string, number>
  elo_after: Record<string, number>
  report: string
}

export type Standing = {
  rank: number
  member: string
  elo: number
  pick_count: number
  current_movie: string | null
}

export type LeagueParams = {
  k: number
  d: number
  w: number
  alpha: number
  start: number
  scale_min: number
  scale_max: number
  voter_share: number
  provisional_picks: number
  k_provisional: number | null
  max_pick_age: number | null
}

export type LeagueView = {
  standings: Standing[]
  history: WeekResult[]
  total_elo: number
  week_count: number
  members: string[]
  standings_report: string
  preview: WeekResult | null
  preview_error: { error: string; type: string } | null
  params: LeagueParams
}

type BridgeOk = LeagueView & { ok: true }
type BridgeErr = { ok: false; error: string; type: string }

export class RankingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RankingError"
  }
}

export function computeLeague(input: {
  members: string[]
  weeks: WeekInput[]
  preview?: WeekInput | null
  params?: { k?: number; d?: number; scale_min?: number; scale_max?: number }
}): LeagueView {
  const python = process.env.PYTHON ?? "python3"
  const script = path.join(process.cwd(), "scripts", "elo_bridge.py")
  const result = spawnSync(python, [script], {
    input: JSON.stringify({
      members: input.members,
      weeks: input.weeks,
      preview: input.preview ?? null,
      ...(input.params ? { params: input.params } : {}),
    }),
    encoding: "utf8",
    cwd: process.cwd(),
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  })

  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === "ENOENT"
    throw new RankingError(
      missing
        ? "Python 3 is required to run the movie_elo ranking engine, and it was not found on PATH."
        : `The ranking engine failed to start: ${result.error.message}`,
    )
  }

  const stdout = result.stdout?.trim() ?? ""
  if (!stdout) {
    throw new RankingError(
      `The ranking engine returned no output (exit ${result.status}). ${result.stderr ?? ""}`.trim(),
    )
  }

  let parsed: BridgeOk | BridgeErr
  try {
    parsed = JSON.parse(stdout) as BridgeOk | BridgeErr
  } catch {
    throw new RankingError(
      `The ranking engine returned invalid JSON. ${result.stderr ?? ""}`.trim(),
    )
  }

  if (!parsed.ok) {
    throw new RankingError(parsed.error)
  }

  return parsed
}
