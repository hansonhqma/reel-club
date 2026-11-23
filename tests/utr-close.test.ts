import assert from "node:assert/strict"
import fs from "node:fs"
import { after, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import { closeDb, getDb } from "../src/lib/db"
import { UtrError, closeUtrMovie, getOpenUtrMovie, leaveUtrClub, restartUtrRating, skipUtrMovie, startUtrRating, suggestUtrMovie, utrCloses, utrList } from "../src/lib/utr"
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

test("only the suggester or an admin can close, and answers can change until then", () => {
  createMember({ username: "ada", name: "Ada", password: "correct-horse", isAdmin: true })
  createMember({ username: "bea", name: "Bea", password: "correct-horse", isAdmin: false })
  createMember({ username: "cyo", name: "Cy", password: "correct-horse", isAdmin: false })
  const ada = idOf("ada")
  const bea = idOf("bea")
  const cy = idOf("cyo")

  const heat = suggestUtrMovie(bea, "Heat")
  assert.throws(() => suggestUtrMovie(ada, "Other"), /Finish Heat/)
  assert.equal(startUtrRating(bea, heat.id, "a_lot").done, true)
  assert.equal(startUtrRating(ada, heat.id, "kinda").done, true)
  assert.equal(startUtrRating(cy, heat.id, "kinda").done, true)
  assert.ok(getOpenUtrMovie())
  assert.throws(() => closeUtrMovie(cy, heat.id), (error: unknown) => {
    assert.ok(error instanceof UtrError)
    assert.equal(error.code, "forbidden")
    return true
  })

  restartUtrRating(ada, heat.id)
  assert.equal(utrList(ada).some((row) => row.title === "Heat"), false)
  assert.equal(startUtrRating(ada, heat.id, "not_really").done, true)
  assert.equal(utrList(ada).find((row) => row.title === "Heat")?.bucket, "not_really")
  skipUtrMovie(ada, heat.id)
  assert.equal(utrList(ada).some((row) => row.title === "Heat"), false)
  assert.equal(startUtrRating(ada, heat.id, "a_lot").done, true)
  assert.equal(utrList(ada).find((row) => row.title === "Heat")?.score, 8.5)

  closeUtrMovie(bea, heat.id)
  assert.equal(getOpenUtrMovie(), null)
  assert.throws(() => startUtrRating(ada, heat.id, "kinda"), /not open/)
  assert.throws(() => skipUtrMovie(ada, heat.id), /not open/)
  assert.throws(() => restartUtrRating(ada, heat.id), /not open/)
  assert.equal(utrList(ada).find((row) => row.title === "Heat")?.score, 8.5)

  const solo = suggestUtrMovie(ada, "Solo")
  assert.equal(startUtrRating(ada, solo.id, "kinda").done, true)
  closeUtrMovie(ada, solo.id)
  const heatElo = utrCloses().find((close) => close.title === "Heat")
  const soloClose = utrCloses().find((close) => close.title === "Solo")
  assert.ok(heatElo && soloClose)
  for (const name of Object.keys(soloClose.elo)) {
    const delta = (soloClose.fromNew[name] ?? 0) + (soloClose.fromOlder[name] ?? 0)
    assert.ok(Math.abs(soloClose.elo[name] - heatElo.elo[name] - delta) < 1e-6, name)
  }

  const night = suggestUtrMovie(bea, "Night")
  leaveUtrClub(bea)
  assert.ok(getOpenUtrMovie())
  assert.throws(() => closeUtrMovie(cy, night.id), /suggester or an admin/)
  closeUtrMovie(ada, night.id)
  assert.equal(getOpenUtrMovie(), null)
  const nightRow = getDb().prepare("SELECT close_reason FROM utr_movies WHERE id = ?").get(night.id) as { close_reason: string }
  assert.equal(nightRow.close_reason, "early")
})
