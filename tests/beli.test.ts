import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import { after, before, describe, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import {
  answerBeliRanking,
  cancelBeliRanking,
  getBeliPending,
  getBeliView,
  peekBeliRanking,
  removeBeliRanking,
  startBeliRanking,
  submitBeliMovie,
} from "../src/lib/beli"
import type { BeliAnswer, BeliBucket, BeliStepResult } from "../src/lib/beli-bridge"
import { closeDb, getDb } from "../src/lib/db"
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

// The library's own score(), so the assertion is against movie_beli, not a copy of its formula.
function libraryScore(bucket: BeliBucket, position: number, size: number): number {
  const result = spawnSync(
    process.env.PYTHON ?? "python3",
    ["-c", `import sys; from movie_beli import score; print(score(${JSON.stringify(bucket)}, ${position}, ${size}))`],
    { encoding: "utf8", env: { ...process.env, PYTHONPATH: "vendor" }, cwd: process.cwd() },
  )
  assert.equal(result.status, 0, result.stderr)
  return Number(result.stdout.trim())
}

// Runs a whole search: pick the bucket, then answer every question with `decide(pivot)`.
function rankWith(userId: number, movieId: number, bucket: BeliBucket, decide: (pivot: string) => BeliAnswer) {
  let step: BeliStepResult = startBeliRanking(userId, movieId, bucket)
  let guard = 0
  while (!step.done) {
    assert.ok(getBeliPending(userId), "an unfinished search is stored")
    step = answerBeliRanking(userId, movieId, decide(step.pivot))
    assert.ok(++guard < 20, "search terminates")
  }
  assert.equal(getBeliPending(userId), null)
  return step
}

describe("beli rankings", { concurrency: 1 }, () => {
  before(() => {
    createMember({ username: "ada", name: "Ada", password: "correct-horse", isAdmin: true })
    createMember({ username: "bea", name: "Bea", password: "correct-horse", isAdmin: false })
    createMember({ username: "cyo", name: "Cy", password: "correct-horse", isAdmin: false })
  })

  test("members submit movies and rank others' picks through the binary search", () => {
    const heat = submitBeliMovie(idOf("ada"), "  Heat ")
    const alien = submitBeliMovie(idOf("ada"), "Alien")
    const seven = submitBeliMovie(idOf("ada"), "Se7en")
    const paddington = submitBeliMovie(idOf("bea"), "Paddington 2")
    assert.equal(heat.title, "Heat")
    assert.equal(heat.submitterName, "Ada")
    assert.throws(() => submitBeliMovie(idOf("cyo"), "heat"), /already on the Beli list/)
    assert.throws(() => submitBeliMovie(idOf("cyo"), ""), /up to 200 characters/)
    assert.throws(() => submitBeliMovie(idOf("cyo"), "bad\u0007title"), /control characters/)
    // U+0085 is whitespace to Python's strip() but not to JS trim(); a title
    // keeping it would never round-trip through the engine and would break
    // every /beli page for everyone. It is refused like the other C1 controls.
    assert.throws(() => submitBeliMovie(idOf("cyo"), "\u0085Alien"), /control characters/)
    assert.throws(() => submitBeliMovie(idOf("cyo"), "Al\u0085ien"), /control characters/)
    assert.throws(() => submitBeliMovie(idOf("cyo"), "\u0085Heat"), /control characters/)
    assert.equal(getBeliView(idOf("bea")).movies.length, 4)
    assert.equal(getBeliView(idOf("cyo")).movies.map((movie) => movie.title).includes("Alien"), true)

    // Own submission is refused before and inside the engine.
    assert.throws(() => startBeliRanking(idOf("ada"), heat.id, "liked"), /don't rank it/)
    assert.throws(() => startBeliRanking(idOf("bea"), heat.id, "meh"), /Liked, Fine/)
    assert.throws(() => answerBeliRanking(idOf("bea"), heat.id, "new"), /no ranking in progress/)

    // Empty bucket: placed with zero questions.
    const first = rankWith(idOf("bea"), heat.id, "liked", () => assert.fail("no question expected"))
    assert.ok(first.done && first.index === 0)

    // Alien above Heat; Se7en between them (prefers Alien, beats Heat).
    rankWith(idOf("bea"), alien.id, "liked", () => "new")
    const order: Record<string, BeliAnswer> = { Alien: "old", Heat: "new" }
    rankWith(idOf("bea"), seven.id, "liked", (pivot) => order[pivot])

    const bea = getBeliView(idOf("bea"))
    assert.deepEqual(
      bea.myList.map((row) => [row.rank, row.movie, row.bucket]),
      [
        [1, "Alien", "liked"],
        [2, "Se7en", "liked"],
        [3, "Heat", "liked"],
      ],
    )
    assert.deepEqual(
      bea.myList.map((row) => row.score),
      [0, 1, 2].map((position) => libraryScore("liked", position, 3)),
    )
    assert.deepEqual(bea.myList.map((row) => row.score), [10, 8.5, 7])
    assert.deepEqual(bea.rankable, [])
    assert.equal(bea.movies.find((movie) => movie.id === alien.id)?.communityScore, 10)
    assert.equal(bea.movies.find((movie) => movie.id === paddington.id)?.communityScore, null)

    // Cy: Heat is fine, Paddington liked -> scores follow bucket size 1 baselines.
    rankWith(idOf("cyo"), heat.id, "fine", () => assert.fail("no question expected"))
    rankWith(idOf("cyo"), paddington.id, "liked", () => assert.fail("no question expected"))
    const cy = getBeliView(idOf("cyo"))
    assert.deepEqual(
      cy.myList.map((row) => [row.movie, row.score]),
      [
        ["Paddington 2", libraryScore("liked", 0, 1)],
        ["Heat", libraryScore("fine", 0, 1)],
      ],
    )
    assert.deepEqual(
      cy.rankable.map((movie) => movie.title),
      ["Alien", "Se7en"],
    )

    // Community score = round-half-up mean: Heat is 7.0 (Bea) and 5.5 (Cy) -> 6.3.
    const heatView = cy.movies.find((movie) => movie.id === heat.id)
    assert.equal(heatView?.communityScore, 6.3)
    assert.deepEqual(
      heatView?.scores.map((row) => [row.member, row.bucket, row.score]),
      [
        ["Bea", "liked", 7],
        ["Cy", "fine", 5.5],
      ],
    )

    // Leaderboard: Ada's three picks average (6.3 + 10 + 8.5) / 3 = 8.3; Bea's one pick is 8.5.
    assert.deepEqual(
      cy.leaderboard.map((row) => [row.member, row.value, row.submitted, row.ranked]),
      [
        ["Bea", 8.5, 1, 1],
        ["Ada", 8.3, 3, 3],
        ["Cy", null, 0, 0],
      ],
    )
  })

  test("too tough, back, and a resumable pending search", () => {
    const cy = idOf("cyo")
    const alien = getBeliView(cy).rankable.find((movie) => movie.title === "Alien")!
    const seven = getBeliView(cy).rankable.find((movie) => movie.title === "Se7en")!

    // Cy's liked bucket holds Paddington. Too tough lands just below the pivot.
    let step = startBeliRanking(cy, alien.id, "liked")
    assert.ok(!step.done && step.pivot === "Paddington 2")
    step = answerBeliRanking(cy, alien.id, "too_tough")
    assert.ok(step.done && step.index === 1)

    // Back undoes an answer; a reload (peek) shows the same question again.
    step = startBeliRanking(cy, seven.id, "liked")
    assert.ok(!step.done && step.questions_left === 2)
    const firstPivot = step.pivot
    step = answerBeliRanking(cy, seven.id, "new")
    assert.ok(!step.done)
    step = answerBeliRanking(cy, seven.id, "back")
    assert.ok(!step.done && step.pivot === firstPivot)
    closeDb()
    const resumed = peekBeliRanking(cy, seven.id)
    assert.ok(resumed && !resumed.done && resumed.pivot === firstPivot)
    assert.equal(peekBeliRanking(cy, alien.id), null)

    // Starting another movie replaces the pending search; cancel clears it. An
    // abandoned re-rank changes nothing.
    step = startBeliRanking(cy, alien.id, "liked")
    assert.ok(!step.done && step.pivot === "Paddington 2")
    assert.equal(getBeliPending(cy)?.movieId, alien.id)
    assert.equal(peekBeliRanking(cy, seven.id), null)
    cancelBeliRanking(cy)
    assert.equal(getBeliPending(cy), null)
    assert.equal(peekBeliRanking(cy, alien.id), null)
    assert.deepEqual(
      getBeliView(cy).myList.map((row) => row.movie),
      ["Paddington 2", "Alien", "Heat"],
    )
  })

  test("remove, re-rank, and lists survive closing the database", () => {
    const bea = idOf("bea")
    const view = getBeliView(bea)
    const seven = view.myList.find((row) => row.movie === "Se7en")!
    const heat = view.myList.find((row) => row.movie === "Heat")!

    removeBeliRanking(bea, seven.movieId)
    assert.deepEqual(
      getBeliView(bea).myList.map((row) => [row.movie, row.score]),
      [
        ["Alien", 10],
        ["Heat", 7],
      ],
    )
    assert.throws(() => removeBeliRanking(bea, seven.movieId), /has not ranked/)
    // Paddington 2 is Bea's own pick, so only Se7en is left to rank.
    assert.deepEqual(
      getBeliView(bea).rankable.map((movie) => movie.title),
      ["Se7en"],
    )

    // Re-rank Heat into "fine": the old placement goes, the new one lands.
    const rerank = rankWith(bea, heat.movieId, "fine", () => assert.fail("fine bucket is empty"))
    assert.ok(rerank.done)
    const after = getBeliView(bea)
    assert.deepEqual(
      after.myList.map((row) => [row.movie, row.bucket, row.score]),
      [
        ["Alien", "liked", libraryScore("liked", 0, 1)],
        ["Heat", "fine", libraryScore("fine", 0, 1)],
      ],
    )
    const positions = getDb()
      .prepare("SELECT bucket, position FROM beli_rankings WHERE user_id = ? ORDER BY bucket, position")
      .all(bea)
    assert.deepEqual(positions, [
      { bucket: "fine", position: 0 },
      { bucket: "liked", position: 0 },
    ])

    closeDb()
    assert.deepEqual(
      getBeliView(bea).myList.map((row) => [row.movie, row.bucket, row.score]),
      after.myList.map((row) => [row.movie, row.bucket, row.score]),
    )
    for (const table of ["beli_movies", "beli_rankings", "beli_pending", "movies", "ratings"]) {
      assert.ok(
        getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
        `${table} exists`,
      )
    }
  })
})
