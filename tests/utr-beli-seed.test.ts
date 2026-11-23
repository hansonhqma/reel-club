import assert from "node:assert/strict"
import fs from "node:fs"
import Database from "better-sqlite3"
import { after, test } from "node:test"
import { closeDb, getDb } from "../src/lib/db"
import { readRatingEvents } from "../src/lib/rating-events"
import { utrCloses, utrList } from "../src/lib/utr"
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
`)
const insertUser = raw.prepare(
  "INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
)
insertUser.run(1, "hanma", "hanma", "x", 1, "2026-01-01T00:00:00.000Z")
insertUser.run(2, "alec", "alec", "x", 0, "2026-01-02T00:00:00.000Z")
raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  1,
  "Heat",
  1,
  "2026-02-01T00:00:00.000Z",
  null,
  "2026-02-02T00:00:00.000Z",
)
raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
  2,
  "Alien",
  2,
  "2026-03-01T00:00:00.000Z",
  null,
  "2026-03-02T00:00:00.000Z",
)
raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(1, 1, 1, 8, 6, "2026-02-02T01:00:00.000Z", "2026-02-02T01:00:00.000Z")
raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(2, 2, 1, 3, 3, "2026-03-02T01:00:00.000Z", "2026-03-02T01:00:00.000Z")
raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(3, 1, 2, 9, 9, "2026-02-02T02:00:00.000Z", "2026-02-02T02:00:00.000Z")
raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(4, 2, 2, 8, 8, "2026-03-02T02:00:00.000Z", "2026-03-02T02:00:00.000Z")
raw.prepare("INSERT INTO beli_movies (id, title, submitter_id, submitted_at) VALUES (?, ?, ?, ?)").run(
  1,
  "In the Mood for Love",
  2,
  "2026-04-01T00:00:00.000Z",
)
raw.prepare("INSERT INTO beli_movies (id, title, submitter_id, submitted_at) VALUES (?, ?, ?, ?)").run(
  2,
  "Yi Yi",
  2,
  "2026-04-02T00:00:00.000Z",
)
raw.prepare(
  "INSERT INTO beli_rankings (user_id, movie_id, bucket, position, ranked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
).run(2, 1, "liked", 0, "2026-04-03T00:00:00.000Z", "2026-04-03T00:00:00.000Z")
raw.prepare(
  "INSERT INTO beli_rankings (user_id, movie_id, bucket, position, ranked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
).run(2, 2, "fine", 0, "2026-04-04T00:00:00.000Z", "2026-04-04T00:00:00.000Z")
raw.close()

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

test("a member with any Beli ranking keeps that list and drops their Elo scores", () => {
  const db = getDb()
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM movies").get() as { c: number }).c, 2)
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM beli_rankings").get() as { c: number }).c, 2)
  assert.deepEqual(
    utrList(1).map((row) => [row.title, row.bucket, row.score]),
    [
      ["Heat", "a_lot", 8.5],
      ["Alien", "not_really", 2],
    ],
  )
  assert.deepEqual(
    utrList(2).map((row) => [row.title, row.bucket, row.score]),
    [
      ["In the Mood for Love", "a_lot", 8.5],
      ["Yi Yi", "kinda", 5.5],
    ],
  )
  const titles = db.prepare("SELECT title FROM utr_movies ORDER BY seq").all() as { title: string }[]
  assert.deepEqual(
    titles.map((row) => row.title),
    ["Heat", "Alien", "In the Mood for Love", "Yi Yi"],
  )
  assert.equal(readRatingEvents(db).some((event) => event.type === "utr.comparison.answered"), false)
  const closes = utrCloses()
  assert.equal(closes.length, 4)
  for (const close of closes) {
    assert.ok(Object.values(close.fromOlder).every((value) => Math.abs(value) < 1e-6))
  }
  for (const name of Object.keys(closes[3].elo)) {
    assert.ok(Math.abs(closes[3].elo[name] - closes[2].elo[name]) < 1e-6, name)
  }
})
