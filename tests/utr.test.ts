import assert from "node:assert/strict"
import fs from "node:fs"
import { spawnSync } from "node:child_process"
import { after, before, describe, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import { closeDb, getDb } from "../src/lib/db"
import { readRatingEvents } from "../src/lib/rating-events"
import { computeLeague } from "../src/lib/ranking"
import { replayUtr } from "../src/lib/utr-replay"
import { utrEloParams } from "../src/lib/utr-elo"
import { answerSearch, bandScore, startSearch } from "../src/lib/utr-score"
import {
  UtrError,
  answerUtrRating,
  closeUtrMovie,
  getOpenUtrMovie,
  leaveUtrClub,
  restartUtrRating,
  skipUtrMovie,
  startUtrRating,
  suggestUtrMovie,
  utrCloses,
  utrList,
} from "../src/lib/utr"
import { prepareTestDb } from "./helpers.ts"

const dir = prepareTestDb()

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

function idOf(username: string): number {
  const user = findUserByUsername(username)
  if (!user) throw new Error(`missing ${username}`)
  return user.id
}

function libraryScore(bucket: string, position: number, size: number): number {
  const result = spawnSync(
    process.env.PYTHON ?? "python3",
    ["-c", `from movie_beli import score; print(score(${JSON.stringify(bucket)}, ${position}, ${size}))`],
    { encoding: "utf8", env: { ...process.env, PYTHONPATH: "vendor" } },
  )
  assert.equal(result.status, 0, result.stderr)
  return Number(result.stdout.trim())
}

function near(actual: Record<string, number>, expected: Record<string, number>): void {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, key)
}

describe("utr", { concurrency: 1 }, () => {
  before(() => {
    createMember({ username: "ada", name: "Ada", password: "correct-horse", isAdmin: true })
    createMember({ username: "bea", name: "Bea", password: "correct-horse", isAdmin: false })
    createMember({ username: "cyo", name: "Cy", password: "correct-horse", isAdmin: false })
  })

  test("band scores and the binary search match the prototype", () => {
    assert.equal(bandScore("a_lot", 0, 1), libraryScore("liked", 0, 1))
    assert.equal(bandScore("a_lot", 0, 2), libraryScore("liked", 0, 2))
    assert.equal(bandScore("a_lot", 1, 2), libraryScore("liked", 1, 2))
    assert.equal(bandScore("kinda", 1, 3), libraryScore("fine", 1, 3))
    assert.equal(bandScore("not_really", 0, 2), libraryScore("disliked", 0, 2))
    assert.equal(bandScore("not_really", 1, 2), libraryScore("disliked", 1, 2))
    assert.equal(bandScore("a_lot", 1, 5), libraryScore("liked", 1, 5))
    assert.equal(bandScore("a_lot", 3, 5), libraryScore("liked", 3, 5))

    const search = startSearch(1, "a_lot", [10, 20, 30])
    const preferred = answerSearch(search, "new")
    assert.equal(preferred.hi, 1)
    assert.equal(preferred.lo, 0)
    const backed = answerSearch(preferred, "back")
    assert.deepEqual([backed.lo, backed.hi, backed.history.length], [0, 3, 0])
    const lower = answerSearch(search, "old")
    assert.equal(lower.lo, 2)
    assert.equal(lower.hi, 3)
  })

  test("lists update immediately, close once, and replay matches", () => {
    const ada = idOf("ada")
    const bea = idOf("bea")
    const cy = idOf("cyo")

    const heat = suggestUtrMovie(ada, "Heat")
    assert.throws(() => suggestUtrMovie(bea, "Alien"), /Finish Heat/)
    assert.equal(startUtrRating(ada, heat.id, "a_lot").done, true)
    assert.equal(utrList(ada)[0].score, 8.5)
    assert.equal(startUtrRating(bea, heat.id, "kinda").done, true)
    assert.equal(startUtrRating(cy, heat.id, "a_lot").done, true)
    assert.ok(getOpenUtrMovie())
    closeUtrMovie(ada, heat.id)
    assert.equal(getOpenUtrMovie(), null)
    assert.throws(() => startUtrRating(bea, heat.id, "not_really"), /not open/)

    const heatClose = utrCloses()
    assert.equal(heatClose.length, 1)
    const heatLeague = computeLeague({
      members: ["Ada", "Bea", "Cy"],
      weeks: [
        {
          week_id: String(heat.id),
          suggester: "Ada",
          movie: "Heat",
          ratings: {
            Bea: { experience: 5.5, quality: 5.5 },
            Cy: { experience: 8.5, quality: 8.5 },
          },
        },
      ],
      params: utrEloParams(3),
    })
    const heatElo = Object.fromEntries(heatLeague.standings.map((row) => [row.member, row.elo]))
    near(heatClose[0].elo, heatElo)
    assert.throws(
      () =>
        computeLeague({
          members: ["Ada", "Bea", "Cy"],
          weeks: [
            {
              week_id: "bad",
              suggester: "Ada",
              movie: "Heat",
              ratings: { Ada: { experience: 8.5, quality: 8.5 } },
            },
          ],
          params: utrEloParams(3),
        }),
      /suggester must not rate/,
    )

    assert.ok(Object.values(heatClose[0].elo).every((value) => value === 1500))

    const alien = suggestUtrMovie(bea, "Alien")
    const adaSearch = startUtrRating(ada, alien.id, "a_lot")
    assert.equal(adaSearch.done, false)
    assert.equal(utrList(ada).some((row) => row.title === "Alien"), false)
    assert.throws(() => answerUtrRating(ada, alien.id, "new", 99), (error: unknown) => {
      assert.ok(error instanceof UtrError)
      assert.equal(error.code, "stale_step")
      return true
    })
    restartUtrRating(ada, alien.id)
    assert.equal(startUtrRating(ada, alien.id, "not_really").done, true)
    assert.equal(startUtrRating(bea, alien.id, "not_really").done, true)
    assert.equal(startUtrRating(cy, alien.id, "not_really").done, true)
    assert.ok(getOpenUtrMovie())
    closeUtrMovie(bea, alien.id)
    assert.equal(getOpenUtrMovie(), null)
    assert.equal(utrList(cy).find((row) => row.title === "Heat")?.score, 8.5)

    const drive = suggestUtrMovie(cy, "Drive")
    const cySearch = startUtrRating(cy, drive.id, "a_lot")
    assert.equal(cySearch.done, false)
    if (!cySearch.done) {
      const placed = answerUtrRating(cy, drive.id, "new", cySearch.historyLength)
      assert.equal(placed.done, true)
      if (placed.done) assert.equal(placed.score, 10)
    }
    assert.equal(startUtrRating(ada, drive.id, "kinda").done, true)
    assert.equal(startUtrRating(bea, drive.id, "a_lot").done, true)
    assert.ok(getOpenUtrMovie())
    closeUtrMovie(cy, drive.id)
    assert.equal(getOpenUtrMovie(), null)
    assert.deepEqual(
      utrList(cy).filter((row) => row.bucket === "a_lot").map((row) => [row.title, row.score]),
      [
        ["Drive", 10],
        ["Heat", 7],
      ],
    )

    const rush = suggestUtrMovie(ada, "Rush")
    assert.throws(() => closeUtrMovie(cy, rush.id), /suggester or an admin/)
    skipUtrMovie(bea, rush.id)
    closeUtrMovie(ada, rush.id)
    assert.equal(getOpenUtrMovie(), null)
    assert.equal(utrList(ada).some((row) => row.title === "Rush"), false)
    assert.equal(utrList(cy).some((row) => row.title === "Rush"), false)
    const rushResponses = getDb()
      .prepare("SELECT user_id, kind FROM utr_responses WHERE movie_id = ? ORDER BY user_id")
      .all(rush.id) as { user_id: number; kind: string }[]
    assert.deepEqual(rushResponses, [
      { user_id: ada, kind: "skip" },
      { user_id: bea, kind: "skip" },
      { user_id: cy, kind: "skip" },
    ])
    assert.throws(() => restartUtrRating(ada, rush.id), /not open/)

    const once = suggestUtrMovie(bea, "Once")
    leaveUtrClub(cy)
    assert.ok(getOpenUtrMovie())
    leaveUtrClub(ada)
    assert.ok(getOpenUtrMovie())
    skipUtrMovie(bea, once.id)
    assert.ok(getOpenUtrMovie())
    closeUtrMovie(bea, once.id)
    assert.equal(getOpenUtrMovie(), null)

    const closes = utrCloses()
    assert.equal(closes.length, 5)
    for (const close of closes) {
      for (const name of Object.keys(close.elo)) {
        const total = (close.fromNew[name] ?? 0) + (close.fromOlder[name] ?? 0)
        const previous = closes[close.seq - 2]
        const before = previous ? (previous.elo[name] ?? 1500) : 1500
        assert.ok(Math.abs(close.elo[name] - before - total) < 1e-6, name)
      }
    }
    assert.equal(closes[0].ranks.Ada.label, "Silver II")
    assert.equal(closes[0].ranks.Bea.tier, "Silver")
    assert.equal(closes[0].ratedPicks.Ada, 1)
    assert.equal(closes[0].ratedPicks.Bea, 0)
    assert.equal(closes[0].ratedPicks.Cy, 0)
    assert.ok(Object.values(closes[0].fromNew).every((value) => value === 0))
    assert.ok(Object.values(closes[1].fromOlder).every((value) => Math.abs(value) < 1e-6))
    assert.ok(Object.values(closes[1].fromNew).reduce((sum, value) => sum + Math.abs(value), 0) > 0)
    assert.ok(Object.values(closes[2].fromOlder).reduce((sum, value) => sum + Math.abs(value), 0) > 0)
    near(closes[3].elo, closes[2].elo)
    near(closes[4].elo, closes[3].elo)

    const replay = replayUtr(readRatingEvents(getDb()))
    const liveLists = getDb()
      .prepare(
        `SELECT user_id, movie_id, bucket, position FROM utr_lists
         ORDER BY user_id, CASE bucket WHEN 'a_lot' THEN 0 WHEN 'kinda' THEN 1 ELSE 2 END, position`,
      )
      .all()
    const replayLists = [...replay.lists.entries()].flatMap(([userId, lists]) =>
      (["a_lot", "kinda", "not_really"] as const).flatMap((bucket) =>
        lists[bucket].map((movieId, position) => ({ user_id: userId, movie_id: movieId, bucket, position })),
      ),
    )
    assert.deepEqual(replayLists, liveLists)
    assert.equal(replay.pending.size, 0)
    assert.equal(replay.closes.length, closes.length)
    const names = new Map(
      (getDb().prepare("SELECT id, name FROM users").all() as { id: number; name: string }[]).map((user) => [user.name, user.id]),
    )
    for (let index = 0; index < closes.length; index += 1) {
      const expected: Record<number, number> = {}
      for (const [name, value] of Object.entries(closes[index].elo)) {
        const id = names.get(name)
        if (id != null) expected[id] = value
      }
      const actual = replay.closes[index].elo
      for (const id of Object.keys(expected)) {
        assert.ok(Math.abs(actual[Number(id)] - expected[Number(id)]) < 1e-6, String(id))
        const name = [...names.entries()].find(([, memberId]) => memberId === Number(id))?.[0]
        assert.equal(replay.closes[index].ranks[Number(id)].label, closes[index].ranks[name ?? ""].label)
        assert.equal(replay.closes[index].ratedPicks[Number(id)], closes[index].ratedPicks[name ?? ""])
      }
    }
    assert.deepEqual(
      replay.members.map((member) => [member.name, member.active]),
      [
        ["Ada", false],
        ["Bea", true],
        ["Cy", false],
      ],
    )
  })
})
