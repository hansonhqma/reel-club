import assert from "node:assert/strict"
import fs from "node:fs"
import { after, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import { closeDb } from "../src/lib/db"
import { utrMovieFeed, utrPicksBySuggester } from "../src/lib/utr-catalog"
import { closeUtrMovie, skipUtrMovie, startUtrRating, suggestUtrMovie, utrCloses } from "../src/lib/utr"
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

test("movies hide an open score until the viewer answers, and picks use the stored close", () => {
  createMember({ username: "ada", name: "Ada", password: "correct-horse", isAdmin: true })
  createMember({ username: "bea", name: "Bea", password: "correct-horse", isAdmin: false })
  createMember({ username: "cyo", name: "Cy", password: "correct-horse", isAdmin: false })
  const ada = idOf("ada")
  const bea = idOf("bea")
  const cy = idOf("cyo")

  const heat = suggestUtrMovie(ada, "Heat")
  assert.equal(startUtrRating(ada, heat.id, "a_lot").done, true)
  assert.equal(startUtrRating(bea, heat.id, "kinda").done, true)
  skipUtrMovie(cy, heat.id)

  const closed = utrMovieFeed(bea).find((movie) => movie.title === "Heat")
  assert.equal(closed?.status, "closed")
  assert.equal(closed?.revealed, true)
  assert.equal(closed?.ratingCount, 1)
  assert.equal(closed?.groupScore, 5.5)
  assert.equal(closed?.people.find((person) => person.name === "Ada")?.suggester, true)
  assert.equal(closed?.people.find((person) => person.name === "Ada")?.score, 8.5)
  assert.equal(closed?.people.find((person) => person.name === "Cy")?.role, "skipped")

  createMember({ username: "dez", name: "Dez", password: "correct-horse", isAdmin: false })
  const dez = idOf("dez")
  assert.equal(utrMovieFeed(dez).find((movie) => movie.title === "Heat")?.revealed, true)

  const night = suggestUtrMovie(bea, "Night")
  const hidden = utrMovieFeed(ada).find((movie) => movie.title === "Night")
  assert.equal(utrMovieFeed(ada)[0]?.title, "Night")
  assert.equal(hidden?.revealed, false)
  assert.equal(hidden?.groupScore, null)
  assert.equal(hidden?.people.every((person) => person.score == null && person.bucket == null), true)
  assert.equal(hidden?.people.find((person) => person.name === "Ada")?.role, "waiting")
  assert.equal(utrMovieFeed(dez).find((movie) => movie.title === "Night")?.revealed, false)

  assert.equal(startUtrRating(ada, night.id, "not_really").done, true)
  const seen = utrMovieFeed(ada).find((movie) => movie.title === "Night")
  assert.equal(seen?.revealed, true)
  assert.equal(seen?.ratingCount, 1)
  assert.equal(seen?.groupScore, 2)
  assert.equal(seen?.people.find((person) => person.name === "Ada")?.bucket, "not_really")
  assert.equal(seen?.people.find((person) => person.name === "Bea")?.role, "waiting")
  assert.equal(utrMovieFeed(dez).find((movie) => movie.title === "Night")?.revealed, false)

  const openPick = utrPicksBySuggester(ada).get("Bea")?.picks.find((pick) => pick.title === "Night")
  assert.equal(openPick?.impact, null)
  assert.equal(openPick?.status, "open")
  assert.equal(openPick?.groupScore, 2)

  skipUtrMovie(cy, night.id)
  closeUtrMovie(bea, night.id)
  const nightClose = utrCloses().find((close) => close.title === "Night")
  const beaPicks = utrPicksBySuggester(ada).get("Bea")
  const closedNight = beaPicks?.picks.find((pick) => pick.title === "Night")
  assert.equal(closedNight?.impact, nightClose?.fromNew.Bea)
  assert.equal(
    beaPicks?.reSorted,
    utrCloses().reduce((sum, close) => sum + (close.fromOlder.Bea ?? 0), 0),
  )
  assert.equal(
    beaPicks?.picksNet,
    beaPicks?.picks.reduce((sum, pick) => sum + (pick.impact ?? 0), 0),
  )

  const solo = suggestUtrMovie(cy, "Solo")
  assert.equal(startUtrRating(cy, solo.id, "kinda").done, true)
  skipUtrMovie(ada, solo.id)
  skipUtrMovie(bea, solo.id)
  skipUtrMovie(dez, solo.id)
  const soloPick = utrPicksBySuggester(cy).get("Cy")?.picks.find((pick) => pick.title === "Solo")
  assert.equal(soloPick?.impact, 0)
  assert.equal(soloPick?.groupScore, null)
  assert.equal(soloPick?.ratingCount, 0)
  assert.equal(utrMovieFeed(dez).find((movie) => movie.title === "Solo")?.people.find((person) => person.name === "Cy")?.suggester, true)
})
