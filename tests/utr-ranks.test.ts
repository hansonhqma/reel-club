import assert from "node:assert/strict"
import { test } from "node:test"
import { computeLeague } from "../src/lib/ranking"
import { utrEloParams } from "../src/lib/utr-elo"
import {
  CHALLENGER_MIN_ELO,
  GRANDMASTER_MIN_ELO,
  absoluteLabel,
  assignRanks,
  nextAbsolute,
  rankSnapshots,
  type RankStep,
} from "../src/lib/utr-ranks"

test("rank cutoffs, the 10-point cushion, and the chairs", () => {
  assert.equal(absoluteLabel(1500), "Silver II")
  assert.equal(absoluteLabel(1480), "Silver II")
  assert.equal(absoluteLabel(1519.9), "Silver II")
  assert.equal(absoluteLabel(1479.9), "Silver III")
  assert.equal(absoluteLabel(1520), "Silver I")
  assert.equal(absoluteLabel(1119.9), "Iron IV")
  assert.equal(absoluteLabel(1120), "Iron III")
  assert.equal(absoluteLabel(1239.9), "Iron I")
  assert.equal(absoluteLabel(1240), "Bronze IV")
  assert.equal(absoluteLabel(1399.9), "Bronze I")
  assert.equal(absoluteLabel(1400), "Silver IV")
  assert.equal(absoluteLabel(1719.9), "Gold I")
  assert.equal(absoluteLabel(1720), "Platinum IV")
  assert.equal(absoluteLabel(1799.9), "Platinum I")
  assert.equal(absoluteLabel(1800), "Emerald IV")
  assert.equal(absoluteLabel(1919.9), "Emerald I")
  assert.equal(absoluteLabel(1920), "Diamond IV")
  assert.equal(absoluteLabel(2079.9), "Diamond I")
  assert.equal(absoluteLabel(2080), "Master")

  assert.equal(nextAbsolute("Silver II", 1470), "Silver II")
  assert.equal(nextAbsolute("Silver II", 1469), "Silver III")
  assert.equal(nextAbsolute("Silver II", 1520), "Silver I")
  assert.equal(nextAbsolute("Iron IV", 900), "Iron IV")
  assert.equal(nextAbsolute("Gold IV", 1555), "Gold IV")
  assert.equal(nextAbsolute("Gold IV", 1549), "Silver I")

  const elos = { A: 1850, B: 1760, C: 1760 }
  const ready = assignRanks(elos, { A: 6, B: 6, C: 6 })
  assert.equal(ready.A, "Challenger")
  assert.equal(ready.B, "Grandmaster")
  assert.equal(ready.C, "Platinum II")

  const early = assignRanks(elos, { A: 5, B: 6, C: 6 })
  assert.equal(early.A, "Emerald III")
  assert.equal(early.B, "Platinum II")
  assert.equal(Object.values(early).includes("Challenger"), false)
  assert.equal(Object.values(early).includes("Grandmaster"), false)

  const low = assignRanks(
    { A: CHALLENGER_MIN_ELO - 1, B: GRANDMASTER_MIN_ELO - 1 },
    { A: 20, B: 20 },
  )
  assert.equal(low.A, "Platinum I")
  assert.equal(low.B, "Gold I")

  const held = assignRanks({ A: 1850, B: 1500 }, { A: 6, B: 0 }, { A: "Emerald III", B: "Silver II" })
  assert.equal(held.A, "Challenger")
  assert.equal(held.B, "Silver II")
})

test("the chair waits for six rated picks across closes", () => {
  const names = new Map([
    [1, "A"],
    [2, "B"],
  ])
  const steps: RankStep[] = []
  const scored = new Map<number, number>()
  for (let movieId = 1; movieId <= 6; movieId += 1) {
    scored.set(movieId, 8)
    const scores = new Map<number, Map<number, number>>()
    scores.set(2, new Map(scored))
    steps.push({
      movieId,
      suggesterId: 1,
      elo: { 1: 1850, 2: 1760 },
      scores,
    })
  }
  const snaps = rankSnapshots(steps, names)
  assert.equal(snaps[4].ranks[1].label, "Emerald III")
  assert.equal(snaps[4].ratedPicks[1], 5)
  assert.equal(snaps[5].ranks[1].label, "Challenger")
  assert.equal(snaps[5].ratedPicks[1], 6)
  assert.equal(snaps[5].ranks[2].label, "Platinum II")

  const cushion = rankSnapshots(
    [
      { movieId: 1, suggesterId: 1, elo: { 1: 1560 }, scores: new Map() },
      { movieId: 2, suggesterId: 1, elo: { 1: 1555 }, scores: new Map() },
      { movieId: 3, suggesterId: 1, elo: { 1: 1549 }, scores: new Map() },
    ],
    new Map([[1, "A"]]),
  )
  assert.deepEqual(
    cushion.map((row) => row.ranks[1].label),
    ["Gold IV", "Gold IV", "Silver I"],
  )
})

test("K is 160 divided by one less than the roster, and a sharper gap moves Elo further", () => {
  assert.equal(utrEloParams(6).k, 32)
  assert.equal(utrEloParams(6).d, 1.25)
  assert.ok(Math.abs(utrEloParams(4).k - 160 / 3) < 1e-12)
  assert.ok(Math.abs(utrEloParams(8).k - 160 / 7) < 1e-12)
  assert.equal(utrEloParams(1).k, 32)

  const members = ["A", "B", "C", "D", "E", "F"]
  const weeks = [
    {
      week_id: "1",
      suggester: "A",
      movie: "One",
      ratings: Object.fromEntries(members.slice(1).map((name) => [name, { experience: 8, quality: 8 }])),
    },
    {
      week_id: "2",
      suggester: "B",
      movie: "Two",
      ratings: Object.fromEntries(["A", "C", "D", "E", "F"].map((name) => [name, { experience: 2, quality: 2 }])),
    },
  ]
  const sharp = computeLeague({ members, weeks, params: utrEloParams(6) })
  const dull = computeLeague({ members, weeks, params: { k: 32, d: 2, scale_min: 0, scale_max: 10 } })
  assert.equal(sharp.params.k, 32)
  assert.equal(sharp.params.d, 1.25)
  const spread = (rows: { elo: number }[]) => Math.max(...rows.map((row) => row.elo)) - Math.min(...rows.map((row) => row.elo))
  assert.ok(spread(sharp.standings) > spread(dull.standings))

  const small = computeLeague({ members: ["A", "B", "C", "D"], weeks: [], params: utrEloParams(4) })
  assert.ok(Math.abs(small.params.k - 160 / 3) < 1e-9)
  assert.equal(small.params.d, 1.25)
})
