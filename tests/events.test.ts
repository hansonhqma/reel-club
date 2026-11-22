import assert from "node:assert/strict"
import fs from "node:fs"
import { after, before, describe, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import {
  answerBeliRanking,
  beliStepToken,
  cancelBeliRanking,
  deleteBeliMovie,
  getBeliPending,
  getBeliPlacement,
  getBeliView,
  peekBeliRanking,
  startBeliRanking,
  submitBeliMovie,
} from "../src/lib/beli"
import { loadLeague, memberNames, rankedMovieInputs, removeSuggestion, submitRating, suggestMovie } from "../src/lib/club"
import { closeDb, getDb } from "../src/lib/db"
import { computeLeague } from "../src/lib/ranking"
import {
  beliStateFromModel,
  eloWeeksFromModel,
  ratingEventsJsonl,
  readRatingEvents,
  reduceRatingEvents,
  type RatingEvent,
  type RebuiltClub,
} from "../src/lib/rating-events"
import { beliView } from "../src/lib/beli-bridge"
import { prepareTestDb } from "./helpers.ts"

const dir = prepareTestDb()
const secret = "event-log-secret-value"

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

function idOf(username: string): number {
  const user = findUserByUsername(username)
  if (!user) throw new Error(`missing ${username}`)
  return user.id
}

function token(userId: number): string {
  return beliStepToken(getBeliPending(userId))
}

function snapshot(model: RebuiltClub) {
  return {
    members: model.members,
    eloMovies: model.eloMovies,
    eloRatings: model.eloRatings,
    beliMovies: model.beliMovies,
    lists: [...model.beliLists.entries()].sort((a, b) => a[0] - b[0]),
    pending: [...model.beliPending.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([userId, pending]) => [userId, pending.movieId, pending.startedAt, pending.insertion]),
  }
}

describe("rating events", { concurrency: 1 }, () => {
  before(() => {
    createMember({ username: "ada", name: "Ada", password: secret, isAdmin: true })
    createMember({ username: "bea", name: "Bea", password: secret, isAdmin: false })
    createMember({ username: "cyo", name: "Cy", password: secret, isAdmin: false })
  })

  test("rating edits append a new event and leave the first one untouched", () => {
    const ada = idOf("ada")
    const bea = idOf("bea")
    const movie = suggestMovie(ada, "Heat", "noir", { suggestedAt: "2026-01-01T00:00:00.000Z" })
    submitRating(bea, movie.id, 8, 7, { at: "2026-02-01T00:00:00.000Z" })
    const afterSet = readRatingEvents(getDb())
    const first = afterSet.find((event) => event.type === "elo.rating.set" && event.movieId === movie.id)
    assert.ok(first)
    const firstPayload = JSON.stringify(first.payload)
    submitRating(bea, movie.id, 9, 6, { at: "2026-03-01T00:00:00.000Z" })
    const events = readRatingEvents(getDb())
    const sets = events.filter((event) => event.type === "elo.rating.set" && event.movieId === movie.id)
    const changes = events.filter((event) => event.type === "elo.rating.changed" && event.movieId === movie.id)
    assert.equal(sets.length, 1)
    assert.equal(JSON.stringify(sets[0].payload), firstPayload)
    assert.equal(sets[0].id, first.id)
    assert.equal(changes.length, 1)
    assert.equal(changes[0].payload.experience, 9)
    assert.deepEqual(changes[0].payload.previous, { experience: 8, quality: 7 })
    assert.ok(changes[0].id > sets[0].id)
    assert.equal(changes[0].backfilled, false)
  })

  test("removing a suggestion keeps the earlier event", () => {
    const ada = idOf("ada")
    const movie = suggestMovie(ada, "Gone", null)
    const before = readRatingEvents(getDb()).filter((event) => event.movieId === movie.id)
    removeSuggestion(ada, movie.id)
    const after = readRatingEvents(getDb()).filter((event) => event.movieId === movie.id)
    assert.equal(after.filter((event) => event.type === "elo.movie.suggested").length, 1)
    assert.equal(after.filter((event) => event.type === "elo.movie.removed").length, 1)
    assert.equal(after[0].id, before[0].id)
    assert.equal(after[0].payload.title, "Gone")
  })

  test("replay matches live Elo and Beli state, independent of event timestamps", () => {
    const ada = idOf("ada")
    const bea = idOf("bea")
    const cy = idOf("cyo")
    const first = submitBeliMovie(ada, "Beli Heat", { submittedAt: "2026-04-01T00:00:00.000Z" })
    const placed = startBeliRanking(bea, first.id, "liked", token(bea))
    assert.equal(placed.done, true)

    const second = submitBeliMovie(cy, "Beli Alien")
    let step = startBeliRanking(bea, second.id, "liked", token(bea))
    assert.equal(step.done, false)
    const open = token(bea)
    step = answerBeliRanking(bea, second.id, "new", open)
    assert.throws(() => answerBeliRanking(bea, second.id, "new", open), /already submitted/)
    if (!step.done) {
      const again = startBeliRanking(bea, second.id, "liked", token(bea))
      assert.equal(again.done, false)
      cancelBeliRanking(bea)
    }

    const third = submitBeliMovie(ada, "Beli Later")
    const searching = startBeliRanking(bea, third.id, "fine", token(bea))
    if (!searching.done) cancelBeliRanking(bea)

    suggestMovie(cy, "Alien", null, { suggestedAt: "2026-04-02T00:00:00.000Z" })
    const alien = getDb().prepare("SELECT id FROM movies WHERE movie = ?").get("Alien") as { id: number }
    submitRating(ada, alien.id, 7, 8, { at: "2026-04-03T00:00:00.000Z" })
    submitRating(bea, alien.id, 6, 6, { at: "2026-04-04T00:00:00.000Z" })

    deleteBeliMovie(ada, first.id, { confirm: true })

    const events = readRatingEvents(getDb())
    const model = reduceRatingEvents(events)
    assert.deepEqual(snapshot(model), snapshot(reduceRatingEvents(events)))

    const fromLog = eloWeeksFromModel(model)
    assert.deepEqual(fromLog.members, memberNames())
    assert.deepEqual(fromLog.weeks, rankedMovieInputs())
    const live = loadLeague().league
    const replayed = computeLeague({ members: fromLog.members, weeks: fromLog.weeks })
    assert.ok(live)
    assert.deepEqual(replayed.standings, live.standings)
    assert.deepEqual(
      replayed.history.map((item) => item.movie),
      live.history.map((item) => item.movie),
    )

    const state = beliStateFromModel(model)
    const replayView = beliView(state, "Bea")
    const liveView = getBeliView(bea)
    assert.deepEqual(
      replayView.my_list.map((row) => [row.movie, row.bucket, row.score]),
      liveView.myList.map((row) => [row.movie, row.bucket, row.score]),
    )
    assert.equal(model.beliPending.get(bea) ?? null, null)
    assert.equal(getBeliPending(bea), null)
    assert.equal(getBeliPlacement(bea, first.id), null)

    const exported = ratingEventsJsonl(getDb())
    assert.equal(exported.includes(secret), false)
    assert.equal(exported.includes("password"), false)
    assert.equal(exported.includes("$2"), false)
    assert.match(exported, /member\.joined/)
    assert.match(exported, /beli\.comparison\.answered/)
    assert.equal(exported.endsWith("\n"), true)
  })

  test("an open search replays to the same insertion after a page view", () => {
    const bea = idOf("bea")
    const movie = submitBeliMovie(idOf("ada"), "Still Open")
    const started = startBeliRanking(bea, movie.id, "liked", token(bea))
    assert.equal(started.done, false)
    const peeked = peekBeliRanking(bea, movie.id)
    assert.ok(peeked && !peeked.done)
    const model = reduceRatingEvents(readRatingEvents(getDb()))
    const pending = model.beliPending.get(bea)
    const live = getBeliPending(bea)
    assert.ok(pending && live)
    assert.equal(pending.movieId, live.movieId)
    assert.equal(pending.startedAt, live.startedAt)
    assert.deepEqual(pending.insertion, live.insertion)
  })
})

test("replay follows sequence id when timestamps run backwards", () => {
  const events: RatingEvent[] = [
    {
      id: 1,
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: 1,
      type: "member.joined",
      schemaVersion: 1,
      movieId: null,
      otherId: null,
      backfilled: false,
      payload: { userId: 1, username: "ada", name: "Ada", isAdmin: true, via: "admin" },
    },
    {
      id: 2,
      occurredAt: "2026-01-01T00:00:00.000Z",
      actorId: 2,
      type: "member.joined",
      schemaVersion: 1,
      movieId: null,
      otherId: null,
      backfilled: false,
      payload: { userId: 2, username: "bea", name: "Bea", isAdmin: false, via: "invite" },
    },
    {
      id: 3,
      occurredAt: "2026-05-01T00:00:00.000Z",
      actorId: 1,
      type: "elo.movie.suggested",
      schemaVersion: 1,
      movieId: 10,
      otherId: null,
      backfilled: false,
      payload: {
        title: "Heat",
        note: null,
        suggestedAt: "2026-01-02T00:00:00.000Z",
        suggesterId: 1,
        rankedAt: null,
      },
    },
    {
      id: 4,
      occurredAt: "2026-06-01T00:00:00.000Z",
      actorId: 2,
      type: "elo.rating.set",
      schemaVersion: 1,
      movieId: 10,
      otherId: null,
      backfilled: false,
      payload: { experience: 8, quality: 7, at: "2026-02-01T00:00:00.000Z" },
    },
    {
      id: 5,
      occurredAt: "2020-01-01T00:00:00.000Z",
      actorId: 2,
      type: "elo.rating.changed",
      schemaVersion: 1,
      movieId: 10,
      otherId: null,
      backfilled: false,
      payload: { experience: 6, quality: 5, at: "2026-03-01T00:00:00.000Z", previous: { experience: 8, quality: 7 } },
    },
  ]
  const model = reduceRatingEvents(events)
  const rating = model.eloRatings[0]
  assert.equal(rating.experience, 6)
  assert.equal(rating.quality, 5)
  assert.equal(rating.createdAt, "2026-02-01T00:00:00.000Z")
  assert.equal(rating.updatedAt, "2026-03-01T00:00:00.000Z")
  assert.equal(model.eloMovies[0].rankedAt, "2026-02-01T00:00:00.000Z")
  const weeks = eloWeeksFromModel(model).weeks
  assert.equal(weeks[0].ranked_at, "2026-02-01T00:00:00.000Z")
  assert.equal(weeks[0].ratings.Bea.experience, 6)
})
