import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { after, test } from "node:test"
import { migrate, closeDb, getDb } from "../src/lib/db"
import { readRatingEvents } from "../src/lib/rating-events"
import { reopenShawshankForJason, SHAWSHANK_REOPEN_REASON } from "../src/lib/shawshank-reopen"
import { replayUtr } from "../src/lib/utr-replay"
import { closeUtrMovie, getOpenUtrMovie, startUtrRating, utrCloses, utrList } from "../src/lib/utr"
import { utrOpenRoster } from "../src/lib/utr-roster"
import { prepareTestDb } from "./helpers.ts"

const dir = prepareTestDb()
const file = process.env.CLUB_DB_PATH
if (!file) throw new Error("CLUB_DB_PATH missing")

function legacyClub(dbFile: string, options: { title?: string; jasonRates?: boolean; extraMovie?: boolean; jason?: boolean }) {
  const raw = new Database(dbFile)
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
  `)
  const insertUser = raw.prepare(
    "INSERT INTO users (id, username, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
  insertUser.run(1, "hanma", "hanma", "x", 1, "2026-11-17T00:00:00.000Z")
  insertUser.run(2, "alec", "alec", "x", 0, "2026-11-17T01:00:00.000Z")
  if (options.jason !== false) insertUser.run(3, "jason", "jason", "x", 0, "2026-11-17T04:00:00.000Z")
  const title = options.title ?? "The Shawshank Redemption"
  raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    4,
    title,
    options.jason === false ? 1 : 3,
    "2026-11-19T00:00:00.000Z",
    null,
    "2026-11-19T06:00:00.000Z",
  )
  const insertRating = raw.prepare(
    "INSERT INTO ratings (id, movie_id, user_id, experience, quality, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
  insertRating.run(2, 4, 1, 8, 8, "2026-11-19T06:51:00.000Z", "2026-11-19T06:51:00.000Z")
  insertRating.run(3, 4, 2, 7, 9, "2026-11-19T06:51:00.000Z", "2026-11-19T06:51:00.000Z")
  if (options.jasonRates) insertRating.run(5, 4, 3, 6, 6, "2026-11-19T06:51:00.000Z", "2026-11-19T06:51:00.000Z")
  if (options.extraMovie) {
    raw.prepare("INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      6,
      "Heat",
      1,
      "2026-11-20T00:00:00.000Z",
      null,
      "2026-11-20T06:00:00.000Z",
    )
    insertRating.run(6, 6, 2, 9, 9, "2026-11-20T06:51:00.000Z", "2026-11-20T06:51:00.000Z")
  }
  raw.close()
}

function boot(setup: (file: string) => void) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "shawshank-"))
  const dbFile = path.join(folder, "club.db")
  setup(dbFile)
  const db = new Database(dbFile)
  db.pragma("foreign_keys = ON")
  migrate(db)
  return { db, folder }
}

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

test("version 5 reopens Shawshank for Jason and the next close rebuilds", () => {
  legacyClub(file, {})
  const db = getDb()
  const movie = db.prepare("SELECT id, title, status, suggester_id, seq FROM utr_movies").get() as {
    id: number
    title: string
    status: string
    suggester_id: number
    seq: number | null
  }
  assert.equal(movie.title, "The Shawshank Redemption")
  assert.equal(movie.status, "open")
  assert.equal(movie.suggester_id, 3)
  assert.equal(movie.seq, 1)
  assert.equal(getOpenUtrMovie()?.id, movie.id)

  const before = db
    .prepare("SELECT user_id, movie_id, bucket, position FROM utr_lists WHERE user_id != 3 ORDER BY user_id, position")
    .all()
  const beforeAnswers = db
    .prepare("SELECT user_id, kind, bucket, answers FROM utr_responses WHERE user_id != 3 ORDER BY user_id")
    .all()
  assert.deepEqual(
    utrOpenRoster(movie.id).map((row) => [row.name, row.kind]),
    [
      ["alec", "rate"],
      ["hanma", "rate"],
      ["jason", null],
    ],
  )
  const reopen = readRatingEvents(db).filter((event) => event.type === "utr.movie.reopened")
  assert.equal(reopen.length, 1)
  assert.equal(reopen[0].actorId, 1)
  assert.equal(reopen[0].payload.reason, SHAWSHANK_REOPEN_REASON)
  assert.equal(reopen[0].payload.userId, 3)
  assert.ok(readRatingEvents(db).some((event) => event.type === "utr.seed.closed"))
  const previousElo = db.prepare("SELECT seq, elo_json FROM utr_closes WHERE movie_id = ?").get(movie.id) as {
    seq: number
    elo_json: string
  }
  assert.equal(previousElo.seq, 1)

  const step = startUtrRating(3, movie.id, "a_lot")
  assert.equal(step.done, true)
  assert.equal(getOpenUtrMovie()?.id, movie.id)
  assert.throws(() => closeUtrMovie(2, movie.id), /suggester or an admin/)
  closeUtrMovie(1, movie.id)
  assert.equal(getOpenUtrMovie(), null)
  assert.equal(utrList(3).find((row) => row.movieId === movie.id)?.score, 8.5)
  assert.deepEqual(
    db.prepare("SELECT user_id, movie_id, bucket, position FROM utr_lists WHERE user_id != 3 ORDER BY user_id, position").all(),
    before,
  )
  assert.deepEqual(
    db
      .prepare("SELECT user_id, kind, bucket, answers FROM utr_responses WHERE user_id != 3 ORDER BY user_id")
      .all(),
    beforeAnswers,
  )
  assert.equal(
    (db.prepare("SELECT suggester_id FROM utr_movies WHERE id = ?").get(movie.id) as { suggester_id: number }).suggester_id,
    3,
  )

  const closes = utrCloses()
  assert.equal(closes.length, 1)
  assert.equal(closes[0].seq, 2)
  const storedBefore = JSON.parse(previousElo.elo_json) as Record<string, number>
  for (const name of Object.keys(closes[0].elo)) {
    const id = (db.prepare("SELECT id FROM users WHERE name = ?").get(name) as { id: number }).id
    const beforeValue = storedBefore[String(id)] ?? 1500
    const delta = (closes[0].fromNew[name] ?? 0) + (closes[0].fromOlder[name] ?? 0)
    assert.ok(Math.abs(closes[0].elo[name] - beforeValue - delta) < 1e-6, name)
    assert.ok(Number.isFinite(closes[0].elo[name]))
  }

  const replay = replayUtr(readRatingEvents(db))
  const names = new Map(
    (db.prepare("SELECT id, name FROM users").all() as { id: number; name: string }[]).map((user) => [user.name, user.id]),
  )
  assert.equal(replay.movies.find((item) => item.title === "The Shawshank Redemption")?.status, "closed")
  assert.equal(replay.closes.length, 1)
  for (const [name, value] of Object.entries(closes[0].elo)) {
    const id = names.get(name)
    assert.ok(id != null)
    assert.ok(Math.abs(replay.closes[0].elo[id] - value) < 1e-6, name)
  }

  closeDb()
  const again = readRatingEvents(getDb()).filter((event) => event.type === "utr.movie.reopened")
  assert.equal(again.length, 1)
})

test("the stored title Shawshank redemption reopens", () => {
  const { db, folder } = boot((dbFile) => legacyClub(dbFile, { title: "Shawshank redemption" }))
  try {
    const movie = db.prepare("SELECT title, status, suggester_id FROM utr_movies").get() as {
      title: string
      status: string
      suggester_id: number
    }
    assert.equal(movie.title, "Shawshank redemption")
    assert.equal(movie.status, "open")
    assert.equal(movie.suggester_id, 3)
  } finally {
    db.close()
    fs.rmSync(folder, { recursive: true, force: true })
  }
})

test("the reopen is a no-op when a guard fails", () => {
  const cases = [
    { title: "Heat" },
    { jasonRates: true },
    { extraMovie: true },
    { jason: false },
  ]
  for (const options of cases) {
    const { db, folder } = boot((dbFile) => legacyClub(dbFile, options))
    try {
      const movie = db.prepare("SELECT title, status FROM utr_movies WHERE title != 'Heat' OR title = 'Heat'").all() as {
        title: string
        status: string
      }[]
      assert.ok(movie.every((row) => row.status === "closed"), JSON.stringify(options))
      assert.equal(
        (db.prepare("SELECT COUNT(*) AS c FROM rating_events WHERE event_type = 'utr.movie.reopened'").get() as { c: number }).c,
        0,
      )
      assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version = 5").get())
    } finally {
      db.close()
      fs.rmSync(folder, { recursive: true, force: true })
    }
  }
})

test("an already open movie blocks the reopen", () => {
  const { db, folder } = boot((dbFile) => legacyClub(dbFile, {}))
  try {
    db.prepare("DELETE FROM schema_migrations WHERE version = 5").run()
    db.prepare("DELETE FROM rating_events WHERE event_type = 'utr.movie.reopened'").run()
    db.prepare("UPDATE utr_movies SET status = 'closed', close_reason = 'seed' WHERE title = 'The Shawshank Redemption'").run()
    db.prepare(
      `INSERT INTO utr_movies (title, suggester_id, suggested_at, status) VALUES ('Heat', 1, '2026-11-21T00:00:00.000Z', 'open')`,
    ).run()
    reopenShawshankForJason(db)
    const shawshank = db.prepare("SELECT status FROM utr_movies WHERE title = 'The Shawshank Redemption'").get() as { status: string }
    assert.equal(shawshank.status, "closed")
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS c FROM rating_events WHERE event_type = 'utr.movie.reopened'").get() as { c: number }).c,
      0,
    )
  } finally {
    db.close()
    fs.rmSync(folder, { recursive: true, force: true })
  }
})
