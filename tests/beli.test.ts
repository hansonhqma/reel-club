import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import { after, before, describe, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import {
  answerBeliRanking,
  beliRankingCount,
  beliStepToken,
  cancelBeliRanking,
  deleteBeliMovie,
  getBeliMovie,
  getBeliPending,
  getBeliPlacement,
  getBeliView,
  otherBeliPending,
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
function currentToken(userId: number): string {
  return beliStepToken(getBeliPending(userId))
}

function rankWith(userId: number, movieId: number, bucket: BeliBucket, decide: (pivot: string) => BeliAnswer) {
  let step: BeliStepResult = startBeliRanking(userId, movieId, bucket, currentToken(userId))
  let guard = 0
  while (!step.done) {
    assert.ok(getBeliPending(userId), "an unfinished search is stored")
    step = answerBeliRanking(userId, movieId, decide(step.pivot), currentToken(userId))
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
    assert.throws(() => startBeliRanking(idOf("ada"), heat.id, "liked", currentToken(idOf("ada"))), /don't rank it/)
    assert.throws(() => startBeliRanking(idOf("bea"), heat.id, "meh", currentToken(idOf("bea"))), /Liked, Fine/)
    assert.throws(
      () => answerBeliRanking(idOf("bea"), heat.id, "new", currentToken(idOf("bea"))),
      /no ranking in progress/,
    )

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
    let step = startBeliRanking(cy, alien.id, "liked", currentToken(cy))
    assert.ok(!step.done && step.pivot === "Paddington 2")
    step = answerBeliRanking(cy, alien.id, "too_tough", currentToken(cy))
    assert.ok(step.done && step.index === 1)

    // Back undoes an answer; a reload (peek) shows the same question again.
    step = startBeliRanking(cy, seven.id, "liked", currentToken(cy))
    assert.ok(!step.done && step.questions_left === 2)
    const firstPivot = step.pivot
    step = answerBeliRanking(cy, seven.id, "new", currentToken(cy))
    assert.ok(!step.done)
    step = answerBeliRanking(cy, seven.id, "back", currentToken(cy))
    assert.ok(!step.done && step.pivot === firstPivot)
    closeDb()
    const resumed = peekBeliRanking(cy, seven.id)
    assert.ok(resumed && !resumed.done && resumed.pivot === firstPivot)
    assert.equal(peekBeliRanking(cy, alien.id), null)

    // Starting another movie replaces the pending search; cancel clears it. An
    // abandoned re-rank changes nothing.
    step = startBeliRanking(cy, alien.id, "liked", currentToken(cy))
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
    removeBeliRanking(bea, seven.movieId)
    assert.equal(getBeliPlacement(bea, seven.movieId), null)
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

  test("two quick submits of the same answer move the search only once", () => {
    const cy = idOf("cyo")
    const ada = idOf("ada")
    const movie = submitBeliMovie(ada, "Twice")
    const started = startBeliRanking(cy, movie.id, "liked", currentToken(cy))
    assert.ok(!started.done)
    const token = currentToken(cy)
    const before = getBeliPending(cy)
    assert.ok(before)
    const next = answerBeliRanking(cy, movie.id, "new", token)
    assert.ok(!next.done)
    assert.throws(() => answerBeliRanking(cy, movie.id, "new", token), /already submitted/)
    assert.throws(() => answerBeliRanking(cy, movie.id, "too_tough", token), /already submitted/)
    assert.throws(() => answerBeliRanking(cy, movie.id, "back", token), /already submitted/)
    const after = getBeliPending(cy)
    assert.equal(after?.insertion.history.length, before.insertion.history.length + 1)
    assert.equal(after?.insertion.lo, next.insertion.lo)
    assert.equal(after?.insertion.hi, next.insertion.hi)
    assert.notEqual(beliStepToken(after), token)
    // A bucket pick rendered before this search started cannot restart it.
    assert.throws(() => startBeliRanking(cy, movie.id, "disliked", ""), /already submitted/)
    assert.equal(getBeliPending(cy)?.insertion.bucket, "liked")
    assert.equal(getBeliPending(cy)?.insertion.history.length, before.insertion.history.length + 1)
    cancelBeliRanking(cy)
  })

  test("the same movie and bucket resumes, and a stale bucket pick is refused", () => {
    const cy = idOf("cyo")
    const movie = submitBeliMovie(idOf("bea"), "Resume Me")
    const started = startBeliRanking(cy, movie.id, "liked", currentToken(cy))
    assert.ok(!started.done)
    const opened = getBeliPending(cy)
    assert.ok(opened)
    answerBeliRanking(cy, movie.id, "new", currentToken(cy))
    const mid = getBeliPending(cy)
    assert.ok(mid)
    assert.equal(mid.insertion.history.length, 1)
    const resumed = startBeliRanking(cy, movie.id, "liked", currentToken(cy))
    assert.ok(!resumed.done)
    assert.equal(getBeliPending(cy)?.startedAt, opened.startedAt)
    assert.equal(getBeliPending(cy)?.insertion.history.length, 1)
    assert.equal(getBeliPending(cy)?.insertion.bucket, "liked")
    assert.equal(otherBeliPending(cy, movie.id), null)
    const elsewhere = submitBeliMovie(idOf("ada"), "Somewhere Else")
    assert.equal(otherBeliPending(cy, elsewhere.id)?.title, "Resume Me")
    assert.equal(otherBeliPending(cy, elsewhere.id)?.bucket, "liked")

    const stale = currentToken(cy)
    const replaced = startBeliRanking(cy, movie.id, "fine", stale)
    assert.ok(!replaced.done)
    assert.equal(getBeliPending(cy)?.insertion.bucket, "fine")
    assert.equal(getBeliPending(cy)?.insertion.history.length, 0)
    assert.notEqual(getBeliPending(cy)?.startedAt, opened.startedAt)
    assert.throws(() => startBeliRanking(cy, movie.id, "disliked", stale), /already submitted/)
    assert.equal(getBeliPending(cy)?.insertion.bucket, "fine")
    cancelBeliRanking(cy)
  })

  test("remove drops a search only when that movie is in the bucket being searched", () => {
    const cy = idOf("cyo")
    const liked = submitBeliMovie(idOf("ada"), "Keep Searching")
    const otherBucket = submitBeliMovie(idOf("bea"), "Other Bucket")
    rankWith(cy, otherBucket.id, "disliked", () => assert.fail("empty disliked bucket"))
    const started = startBeliRanking(cy, liked.id, "liked", currentToken(cy))
    assert.ok(!started.done)
    const pending = getBeliPending(cy)
    assert.equal(pending?.movieId, liked.id)

    removeBeliRanking(cy, otherBucket.id)
    assert.equal(getBeliPlacement(cy, otherBucket.id), null)
    assert.equal(getBeliPending(cy)?.movieId, liked.id)
    assert.equal(getBeliPending(cy)?.startedAt, pending?.startedAt)

    const pivotId = getBeliView(cy).myList.find((row) => row.movie === started.pivot && row.bucket === "liked")?.movieId
    assert.ok(pivotId)
    removeBeliRanking(cy, pivotId)
    assert.equal(getBeliPending(cy), null)
    removeBeliRanking(cy, pivotId)
  })

  test("removing the movie being ranked drops its search", () => {
    const bea = idOf("bea")
    const movie = getBeliView(bea).myList.find((row) => row.movie === "Alien")
    assert.ok(movie)
    const started = startBeliRanking(bea, movie.movieId, "fine", currentToken(bea))
    assert.ok(!started.done)
    assert.equal(getBeliPending(bea)?.movieId, movie.movieId)
    removeBeliRanking(bea, movie.movieId)
    assert.equal(getBeliPending(bea), null)
    assert.equal(getBeliPlacement(bea, movie.movieId), null)
    removeBeliRanking(bea, movie.movieId)
  })

  test("an unranked movie can be deleted by its submitter or an admin, and that cascades", () => {
    const bea = idOf("bea")
    const cy = idOf("cyo")
    const ada = idOf("ada")
    const movie = submitBeliMovie(bea, "Delete Me")
    startBeliRanking(cy, movie.id, "liked", currentToken(cy))
    assert.equal(getBeliPending(cy)?.movieId, movie.id)
    assert.throws(() => deleteBeliMovie(cy, movie.id), /who added this/)
    assert.equal(getBeliPending(cy)?.movieId, movie.id)
    deleteBeliMovie(ada, movie.id)
    assert.equal(getBeliMovie(movie.id), null)
    assert.equal(getBeliPending(cy), null)
    assert.equal(beliRankingCount(movie.id), 0)

    const own = submitBeliMovie(bea, "Delete Mine")
    deleteBeliMovie(bea, own.id)
    assert.equal(getBeliMovie(own.id), null)
  })

  test("a ranked movie can be deleted only by an admin who confirms", () => {
    const ada = idOf("ada")
    const bea = idOf("bea")
    const cy = idOf("cyo")
    const movie = submitBeliMovie(bea, "Ranked Delete")
    rankWith(cy, movie.id, "disliked", () => assert.fail("empty disliked bucket"))
    assert.equal(beliRankingCount(movie.id), 1)
    assert.throws(() => deleteBeliMovie(bea, movie.id), /admin/)
    assert.throws(() => deleteBeliMovie(ada, movie.id), /Confirm/)
    assert.equal(beliRankingCount(movie.id), 1)
    deleteBeliMovie(ada, movie.id, { confirm: true })
    assert.equal(getBeliMovie(movie.id), null)
    assert.equal(beliRankingCount(movie.id), 0)
    assert.equal(
      (getDb().prepare("SELECT COUNT(*) AS c FROM beli_pending WHERE movie_id = ?").get(movie.id) as { c: number }).c,
      0,
    )
  })
})
