import assert from "node:assert/strict"
import fs from "node:fs"
import Database from "better-sqlite3"
import { after, test } from "node:test"
import { closeDb, getDb } from "../src/lib/db"
import { readRatingEvents } from "../src/lib/rating-events"
import { replayUtr } from "../src/lib/utr-replay"
import { utrCloses, utrList } from "../src/lib/utr"
import { prepareTestDb } from "./helpers.ts"

// Post-cleanup club: Shawshank is the only Elo movie, Dallas and the unrated
// queue are already gone, and nobody has a Beli ranking left. The four score
// pairs are the ones the cleanup fixture recorded. This is not a copy of the
// production file.
const ratings = [
  { id: 2, userId: 1, experience: 8, quality: 8 },
  { id: 3, userId: 2, experience: 7, quality: 9 },
  { id: 4, userId: 3, experience: 6, quality: 7 },
  { id: 5, userId: 4, experience: 9, quality: 8 },
]

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
`)
const insertUser = raw.prepare(
  "INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
)
insertUser.run(1, "hanma", "hanma", "x", 1, "2026-11-17T00:00:00.000Z")
insertUser.run(2, "alec", "alec", "x", 0, "2026-11-17T01:00:00.000Z")
insertUser.run(3, "mira", "mira", "x", 0, "2026-11-17T02:00:00.000Z")
insertUser.run(4, "sam", "sam", "x", 0, "2026-11-17T03:00:00.000Z")
insertUser.run(5, "jason", "jason", "x", 0, "2026-11-17T04:00:00.000Z")
raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  4,
  "Shawshank Redemption",
  5,
  "2026-11-19T00:00:00.000Z",
  null,
  "2026-11-19T06:00:00.000Z",
)
const insertRating = raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
)
for (const rating of ratings) {
  insertRating.run(rating.id, 4, rating.userId, rating.experience, rating.quality, "2026-11-19T06:51:00.000Z", "2026-11-19T06:51:00.000Z")
}
raw.close()

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

test("version 4 seeds Shawshank from blended scores and keeps the old rows", () => {
  const db = getDb()
  assert.deepEqual(db.prepare("SELECT id, movie FROM movies").all(), [{ id: 4, movie: "Shawshank Redemption" }])
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM ratings").get() as { c: number }).c, 4)
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM beli_movies").get() as { c: number }).c, 0)

  const movies = db.prepare("SELECT title, status, close_reason, seq, suggester_id FROM utr_movies").all()
  assert.deepEqual(movies, [{ title: "Shawshank Redemption", status: "closed", close_reason: "seed", seq: 1, suggester_id: 5 }])

  const list = (userId: number) => utrList(userId).map((row) => [row.title, row.bucket, row.score])
  assert.deepEqual(list(1), [["Shawshank Redemption", "a_lot", 8.5]])
  assert.deepEqual(list(2), [["Shawshank Redemption", "a_lot", 8.5]])
  assert.deepEqual(list(3), [["Shawshank Redemption", "kinda", 5.5]])
  assert.deepEqual(list(4), [["Shawshank Redemption", "a_lot", 8.5]])
  assert.deepEqual(list(5), [])

  const answers = db.prepare("SELECT answers FROM utr_responses").all() as { answers: string }[]
  assert.ok(answers.length > 0)
  assert.ok(answers.every((row) => row.answers === "[]"))
  const events = readRatingEvents(db)
  assert.equal(events.some((event) => event.type === "utr.comparison.answered"), false)
  assert.equal(events.some((event) => event.type === "utr.bucket.chosen"), false)

  const closes = utrCloses()
  assert.equal(closes.length, 1)
  // One movie has no earlier pick to play, so movie_elo leaves everyone at the start.
  for (const name of ["hanma", "alec", "mira", "sam", "jason"]) {
    assert.equal(closes[0].elo[name], 1500)
    assert.equal(closes[0].fromNew[name], 0)
    assert.equal(closes[0].fromOlder[name], 0)
  }

  const replay = replayUtr(events)
  assert.equal(replay.closes.length, 1)
  for (const [name, value] of Object.entries(closes[0].elo)) {
    const id = (db.prepare("SELECT id FROM users WHERE name = ?").get(name) as { id: number }).id
    assert.ok(Math.abs(replay.closes[0].elo[id] - value) < 1e-6, name)
  }

})
