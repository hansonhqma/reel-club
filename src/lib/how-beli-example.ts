/**
 * Made-up Beli club for the How page. tests/how.test.ts replays these
 * placements through movie_beli and checks the displayed scores.
 *
 * Alex adds Night Bus, Bea adds Rooftop, Cam adds Lantern. Nobody ranks
 * their own film. Bea ranks Night Bus alone in Liked, then ranks Lantern
 * above it. Cam ranks Night Bus in Liked and Rooftop alone in Fine.
 */

import { NIGHT_BUS, ROOFTOP } from "@/lib/how-example"

export const BELI_MEMBERS = ["Alex", "Bea", "Cam"] as const

export const LANTERN = "Lantern"

export const BELI_MOVIES = [
  { title: NIGHT_BUS.movie, submittedBy: NIGHT_BUS.suggester },
  { title: ROOFTOP.movie, submittedBy: ROOFTOP.suggester },
  { title: LANTERN, submittedBy: "Cam" },
] as const

export type BeliBand = {
  label: string
  alone: number
  top: number
  bottom: number
}

/** Alone is the one-movie baseline. Top and bottom are a bucket of two or more. */
export const BELI_BANDS = {
  liked: { label: "Liked", alone: 8.5, top: 10, bottom: 7 },
  fine: { label: "Fine", alone: 5.5, top: 6.9, bottom: 4 },
  disliked: { label: "Didn't like", alone: 2, top: 3.9, bottom: 0 },
} as const satisfies Record<string, BeliBand>

/** Bea preferred Lantern to Night Bus. Best first. */
export const BEA_PREFER_NEW = [
  { movie: LANTERN, score: 10 },
  { movie: NIGHT_BUS.movie, score: 7 },
] as const

/** The same question, if Bea had chosen Too tough to call. */
export const BEA_TOO_TOUGH = [
  { movie: NIGHT_BUS.movie, score: 10 },
  { movie: LANTERN, score: 7 },
] as const

/** Cam's list: Liked, then Fine. */
export const CAM_LIST = [
  { movie: NIGHT_BUS.movie, bucket: BELI_BANDS.liked.label, score: BELI_BANDS.liked.alone },
  { movie: ROOFTOP.movie, bucket: BELI_BANDS.fine.label, score: BELI_BANDS.fine.alone },
] as const

export const BELI_COMMUNITY = {
  nightBus: 7.8,
  lantern: 10,
  rooftop: 5.5,
} as const

/** Leaderboard order: whose picks scored highest. */
export const BELI_BOARD = [
  { member: "Cam", score: 10 },
  { member: "Alex", score: BELI_COMMUNITY.nightBus },
  { member: "Bea", score: BELI_COMMUNITY.rooftop },
] as const

/** After Bea removes Lantern. Cam's Lantern has no rankings left. */
export const AFTER_REMOVAL = {
  beaNightBus: BELI_BANDS.liked.alone,
  communityNightBus: BELI_BANDS.liked.alone,
  alex: BELI_BANDS.liked.alone,
  bea: BELI_COMMUNITY.rooftop,
} as const

export function beliTenths(value: number): string {
  return value.toFixed(1)
}
