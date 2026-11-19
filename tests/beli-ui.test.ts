import assert from "node:assert/strict"
import { test } from "node:test"
import { addedMoviesScoreLine } from "../src/lib/format.ts"

test("beli leaderboard counts added movies that have a score", () => {
  assert.equal(addedMoviesScoreLine(3, 3), "3 of 3 added movies have a score")
  assert.equal(addedMoviesScoreLine(1, 3), "1 of 3 added movies has a score")
  assert.equal(addedMoviesScoreLine(0, 2), "0 of 2 added movies have a score")
  assert.equal(addedMoviesScoreLine(1, 1), "1 of 1 added movie has a score")
  assert.equal(addedMoviesScoreLine(0, 1), "0 of 1 added movie, no score yet")
})
