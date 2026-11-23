// A made-up four-person club. Elo numbers come from movie_elo with the live
// UTR settings (d = 1.25, K = 160 / (n − 1)). The page only displays these.

import { formatDelta, formatElo } from "@/lib/format"
import { computeLeague } from "@/lib/ranking"
import { bandScore } from "@/lib/utr-score"
import { utrEloParams } from "@/lib/utr-elo"

export const STORY_FRIENDS = ["Ana", "Ben", "Cam", "Dee"] as const

const params = utrEloParams(STORY_FRIENDS.length)

function rate(score: number) {
  return { experience: score, quality: score }
}

const paperMoonAtClose2 = {
  week_id: "1",
  suggester: "Ana",
  movie: "Paper Moon",
  ratings: { Ben: rate(8.5), Cam: rate(5.5), Dee: rate(6.9) },
}

const longTable = {
  week_id: "2",
  suggester: "Ben",
  movie: "The Long Table",
  ratings: { Cam: rate(8.5), Dee: rate(4) },
}

const paperMoonAfterSlip = {
  ...paperMoonAtClose2,
  ratings: { Ben: rate(8.5), Cam: rate(5.5), Dee: rate(5.5) },
}

const close2 = computeLeague({
  members: [...STORY_FRIENDS],
  weeks: [paperMoonAtClose2, longTable],
  params,
})

const replayed = computeLeague({
  members: [...STORY_FRIENDS],
  weeks: [paperMoonAfterSlip, longTable],
  params,
})

const night2 = close2.history[1]
const replayedNight2 = replayed.history[1]

function elo(value: number): string {
  return formatElo(value)
}

function delta(value: number): string {
  return formatDelta(value)
}

function mean(scores: number[]): string {
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return (Math.round((average + Number.EPSILON) * 10) / 10).toFixed(1)
}

export const HOW_STORY = {
  friends: STORY_FRIENDS,
  alone: {
    loved: bandScore("a_lot", 0, 1).toFixed(1),
    justOk: bandScore("kinda", 0, 1).toFixed(1),
    disliked: bandScore("not_really", 0, 1).toFixed(1),
  },
  justOkPair: {
    top: bandScore("kinda", 0, 2).toFixed(1),
    bottom: bandScore("kinda", 1, 2).toFixed(1),
  },
  startElo: elo(1500),
  afterLongTable: {
    Ana: elo(night2.elo_after.Ana),
    Ben: elo(night2.elo_after.Ben),
    Cam: elo(night2.elo_after.Cam),
    Dee: elo(night2.elo_after.Dee),
  },
  newMovie: {
    Ana: delta(night2.deltas.Ana ?? 0),
    Ben: delta(night2.deltas.Ben ?? 0),
    Cam: delta(night2.deltas.Cam ?? 0),
    Dee: delta(night2.deltas.Dee ?? 0),
  },
  reSortedLater: {
    Ana: delta(replayedNight2.elo_after.Ana - night2.elo_after.Ana),
    Ben: delta(replayedNight2.elo_after.Ben - night2.elo_after.Ben),
  },
  groupScoreFirstNight: mean([8.5, 5.5, 5.5]),
  groupScoreAfterDeeMoves: mean([8.5, 5.5, 6.9]),
}
