import assert from "node:assert/strict"
import fs from "node:fs"
import Database from "better-sqlite3"
import { after, test } from "node:test"
import { closeDb, getDb } from "../src/lib/db"
import { rankedMovieInputs } from "../src/lib/club"
import {
  eloWeeksFromModel,
  readRatingEvents,
  reduceRatingEvents,
  UNWATCHED_CLEANUP_REASON,
} from "../src/lib/rating-events"
import { prepareTestDb } from "./helpers.ts"

const dir = prepareTestDb()
const file = process.env.CLUB_DB_PATH
if (!file) throw new Error("CLUB_DB_PATH missing")

const shawshankRatings = [
  { id: 2, userId: 1, experience: 8, quality: 8 },
  { id: 3, userId: 2, experience: 7, quality: 9 },
  { id: 4, userId: 3, experience: 6, quality: 7 },
  { id: 5, userId: 4, experience: 9, quality: 8 },
]

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
const insertUser = raw.prepare(
  "INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
)
insertUser.run(1, "hanma", "hanma", "secret-hash", 1, "2026-11-17T00:00:00.000Z")
insertUser.run(2, "alec", "alec", "secret-hash", 0, "2026-11-17T01:00:00.000Z")
insertUser.run(3, "mira", "mira", "secret-hash", 0, "2026-11-17T02:00:00.000Z")
insertUser.run(4, "sam", "sam", "secret-hash", 0, "2026-11-17T03:00:00.000Z")
insertUser.run(5, "jason", "jason", "secret-hash", 0, "2026-11-17T04:00:00.000Z")
const insertMovie = raw.prepare(
  "INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)",
)
insertMovie.run(1, "Dallas buyers club", 2, "2026-11-17T06:20:00.000Z", null, "2026-11-17T06:32:00.000Z")
insertMovie.run(2, "Chungking express", 5, "2026-11-18T00:00:00.000Z", null, null)
insertMovie.run(3, "Fallen Angels (1995)", 5, "2026-11-18T01:00:00.000Z", "queue", null)
insertMovie.run(4, "Shawshank Redemption", 5, "2026-11-19T00:00:00.000Z", null, "2026-11-19T06:00:00.000Z")
const insertRating = raw.prepare(
  "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
)
insertRating.run(1, 1, 1, 5, 9, "2026-11-17T06:32:00.000Z", "2026-11-17T06:32:00.000Z")
for (const rating of shawshankRatings) {
  insertRating.run(
    rating.id,
    4,
    rating.userId,
    rating.experience,
    rating.quality,
    "2026-11-19T06:51:00.000Z",
    "2026-11-19T06:51:00.000Z",
  )
}
raw.prepare("INSERT INTO beli_movies (id, title, submitter_id, submitted_at) VALUES (?, ?, ?, ?)").run(
  1,
  "Dallas buyers club",
  2,
  "2026-11-19T01:09:00.000Z",
)
raw.prepare(
  "INSERT INTO beli_rankings (user_id, movie_id, bucket, position, ranked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
).run(1, 1, "liked", 0, "2026-11-19T02:00:00.000Z", "2026-11-19T02:00:00.000Z")
raw.prepare("INSERT INTO beli_pending (user_id, movie_id, state, started_at) VALUES (?, ?, ?, ?)").run(
  3,
  1,
  JSON.stringify({
    member: "mira",
    movie: "Dallas buyers club",
    bucket: "fine",
    candidates: [],
    lo: 0,
    hi: 1,
    history: [],
    rerank: false,
  }),
  "2026-11-19T03:00:00.000Z",
)
raw.close()

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

test("cleanup leaves only Shawshank and its four ratings", () => {
  const db = getDb()
  const movies = db.prepare("SELECT id, movie FROM movies ORDER BY id").all() as { id: number; movie: string }[]
  assert.deepEqual(movies, [{ id: 4, movie: "Shawshank Redemption" }])
  const ratings = db
    .prepare("SELECT id, movie_id, user_id, experience, quality FROM ratings ORDER BY id")
    .all() as { id: number; movie_id: number; user_id: number; experience: number; quality: number }[]
  assert.deepEqual(
    ratings,
    shawshankRatings.map((rating) => ({
      id: rating.id,
      movie_id: 4,
      user_id: rating.userId,
      experience: rating.experience,
      quality: rating.quality,
    })),
  )
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM beli_movies").get() as { c: number }).c, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM beli_rankings").get() as { c: number }).c, 0)
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM beli_pending").get() as { c: number }).c, 0)

  const cleanup = readRatingEvents(db).filter((event) => event.payload.reason === UNWATCHED_CLEANUP_REASON)
  assert.deepEqual(
    cleanup.map((event) => [event.type, event.movieId, event.actorId]),
    [
      ["elo.movie.removed", 2, 1],
      ["elo.movie.removed", 3, 1],
      ["elo.rating.removed", 1, 1],
      ["elo.movie.removed", 1, 1],
      ["beli.movie.deleted", 1, 1],
    ],
  )
  const removedRating = cleanup.find((event) => event.type === "elo.rating.removed")
  assert.equal(removedRating?.payload.userId, 1)
  assert.equal(removedRating?.payload.experience, 5)
  assert.equal(removedRating?.payload.quality, 9)
  assert.equal(
    cleanup.some((event) => event.movieId === 4),
    false,
  )

  const weeks = eloWeeksFromModel(reduceRatingEvents(readRatingEvents(db)))
  assert.deepEqual(weeks.weeks, rankedMovieInputs())
  assert.deepEqual(
    weeks.weeks.map((week) => week.movie),
    ["Shawshank Redemption"],
  )
  assert.equal(Object.keys(weeks.weeks[0].ratings).length, 4)

  closeDb()
  const again = getDb().prepare("SELECT id FROM movies").all() as { id: number }[]
  assert.deepEqual(again, [{ id: 4 }])
  assert.equal((getDb().prepare("SELECT COUNT(*) AS c FROM ratings").get() as { c: number }).c, 4)
})
