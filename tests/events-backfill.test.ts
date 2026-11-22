import assert from "node:assert/strict"
import fs from "node:fs"
import Database from "better-sqlite3"
import { after, test } from "node:test"
import { closeDb, getDb } from "../src/lib/db"
import { loadLeague, rankedMovieInputs } from "../src/lib/club"
import { beliStateFromModel, eloWeeksFromModel, ratingEventsJsonl, readRatingEvents, reduceRatingEvents } from "../src/lib/rating-events"
import { beliView } from "../src/lib/beli-bridge"
import { prepareTestDb } from "./helpers.ts"

const dir = prepareTestDb()
const file = process.env.CLUB_DB_PATH
if (!file) throw new Error("CLUB_DB_PATH missing")

const raw = new Database(file)
raw.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE movies (
    id INTEGER PRIMARY KEY,
    movie TEXT NOT NULL,
    suggester_id INTEGER NOT NULL,
    suggested_at TEXT NOT NULL,
    note TEXT,
    ranked_at TEXT
  );
  CREATE TABLE ratings (
    id INTEGER PRIMARY KEY,
    movie_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    experience REAL NOT NULL,
    quality REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE beli_movies (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    submitter_id INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
  );
  CREATE TABLE beli_rankings (
    user_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    bucket TEXT NOT NULL,
    position INTEGER NOT NULL,
    ranked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, movie_id)
  );
  CREATE TABLE beli_pending (
    user_id INTEGER PRIMARY KEY,
    movie_id INTEGER NOT NULL,
    state TEXT NOT NULL,
    started_at TEXT NOT NULL
  );
`)
raw.prepare("INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  1,
  "ada",
  "Ada",
  "super-secret-password-hash",
  1,
  "2026-01-01T00:00:00.000Z",
)
raw.prepare("INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  2,
  "bea",
  "Bea",
  "super-secret-password-hash",
  0,
  "2026-01-02T00:00:00.000Z",
)
// Lock time is later than the rating, the way a migrated closed week is stored.
raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  1,
  "Locked Late",
  1,
  "2026-01-03T00:00:00.000Z",
  null,
  "2026-05-01T00:00:00.000Z",
)
raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  2,
  "Ranked Earlier",
  2,
  "2026-02-01T00:00:00.000Z",
  "note",
  "2026-03-01T00:00:00.000Z",
)
raw.prepare("INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  3,
  "cyo",
  "Cy",
  "super-secret-password-hash",
  0,
  "2026-06-01T00:00:00.000Z",
)
// Suggested before Cy joined. The event must wait until that join.
raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  3,
  "Too Early",
  3,
  "2026-01-15T00:00:00.000Z",
  null,
  null,
)
// Scored before the movie was suggested and before Bea joined. Clamped after both.
raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(1, 1, 2, 8, 7, "2026-01-01T00:00:00.000Z", "2026-01-11T00:00:00.000Z")
raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(2, 2, 1, 6, 6, "2026-03-01T00:00:00.000Z", "2026-03-02T00:00:00.000Z")
raw.prepare("INSERT INTO beli_movies (id, title, submitter_id, submitted_at) VALUES (?, ?, ?, ?)").run(
  1,
  "Beli One",
  1,
  "2026-04-01T00:00:00.000Z",
)
raw.prepare(
  "INSERT INTO beli_rankings (user_id, movie_id, bucket, position, ranked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
).run(2, 1, "liked", 0, "2026-04-02T00:00:00.000Z", "2026-04-03T00:00:00.000Z")
raw.prepare("INSERT INTO beli_pending (user_id, movie_id, state, started_at) VALUES (?, ?, ?, ?)").run(
  1,
  1,
  JSON.stringify({
    member: "Ada",
    movie: "Beli One",
    bucket: "fine",
    candidates: [],
    lo: 0,
    hi: 1,
    history: [],
    rerank: false,
  }),
  "2026-04-04T00:00:00.000Z",
)
raw.close()

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

test("backfill replays to the live rankings and does not invent comparison steps", () => {
  const db = getDb()
  const events = readRatingEvents(db)
  assert.ok(events.length > 0)
  assert.ok(events.every((event) => event.backfilled))
  assert.equal(events.some((event) => event.type === "beli.comparison.answered"), false)
  assert.equal(events.some((event) => event.type === "beli.ranking.placed"), true)
  assert.equal(events.some((event) => event.type === "beli.search.started"), true)

  const labels = events.map((event) => {
    const title = typeof event.payload.title === "string" ? event.payload.title : ""
    const name = typeof event.payload.name === "string" ? event.payload.name : ""
    return `${event.type}:${title || name || event.movieId}`
  })
  assert.deepEqual(labels, [
    "member.joined:Ada",
    "member.joined:Bea",
    "elo.movie.suggested:Locked Late",
    "elo.rating.set:1",
    "elo.movie.suggested:Ranked Earlier",
    "elo.rating.set:2",
    "beli.movie.submitted:Beli One",
    "beli.ranking.placed:Beli One",
    "beli.search.started:Beli One",
    "member.joined:Cy",
    "elo.movie.suggested:Too Early",
  ])
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(Date.parse(events[index].occurredAt) >= Date.parse(events[index - 1].occurredAt))
  }
  const locked = events.find((event) => event.type === "elo.movie.suggested" && event.payload.title === "Locked Late")
  const earlyRating = events.find((event) => event.type === "elo.rating.set" && event.movieId === 1)
  const shawshank = events.find((event) => event.payload.title === "Ranked Earlier")
  const beli = events.find((event) => event.type === "beli.movie.submitted")
  const laterRating = events.find((event) => event.type === "elo.rating.set" && event.movieId === 2)
  const cy = events.find((event) => event.type === "member.joined" && event.payload.name === "Cy")
  const tooEarly = events.find((event) => event.payload.title === "Too Early")
  assert.ok(locked && earlyRating && shawshank && beli && laterRating && cy && tooEarly)
  assert.ok(earlyRating.id > locked.id)
  assert.ok(earlyRating.id < shawshank.id)
  assert.equal(earlyRating.occurredAt, locked.occurredAt)
  assert.equal(earlyRating.payload.at, "2026-01-01T00:00:00.000Z")
  assert.ok(beli.id > laterRating.id)
  assert.equal(tooEarly.occurredAt, cy.occurredAt)
  assert.equal(tooEarly.payload.suggestedAt, "2026-01-15T00:00:00.000Z")
  assert.ok(tooEarly.id > cy.id)

  const model = reduceRatingEvents(events)
  const weeks = eloWeeksFromModel(model)
  assert.deepEqual(weeks.weeks, rankedMovieInputs())
  assert.deepEqual(
    weeks.weeks.map((week) => week.movie),
    ["Ranked Earlier", "Locked Late"],
  )
  const live = loadLeague().league
  assert.ok(live)
  assert.deepEqual(
    live.history.map((item) => item.movie),
    ["Ranked Earlier", "Locked Late"],
  )

  const view = beliView(beliStateFromModel(model), "Bea")
  assert.deepEqual(
    view.my_list.map((row) => [row.movie, row.bucket, row.score]),
    [["Beli One", "liked", 8.5]],
  )
  const pending = model.beliPending.get(1)
  assert.equal(pending?.movieId, 1)
  assert.equal(pending?.insertion.bucket, "fine")
  assert.equal(pending?.startedAt, "2026-04-04T00:00:00.000Z")

  const exported = ratingEventsJsonl(db)
  assert.equal(exported.includes("super-secret-password-hash"), false)
  assert.equal(db.prepare("SELECT 1 FROM schema_migrations WHERE version = 2").get() != null, true)

  closeDb()
  const again = readRatingEvents(getDb())
  assert.equal(again.length, events.length)
})
