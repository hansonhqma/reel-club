import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

const globalForDb = globalThis as unknown as {
  __reelDb?: Database.Database
  __reelDbPath?: string
}

// Accounts and sessions. Movie tables are created by migrate() so an existing
// weekly database can be rewritten without CREATE TABLE IF NOT EXISTS leaving
// the old ratings shape in place.
const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`

const MOVIE_SCHEMA = `
CREATE TABLE movies (
  id INTEGER PRIMARY KEY,
  movie TEXT NOT NULL,
  suggester_id INTEGER NOT NULL REFERENCES users(id),
  suggested_at TEXT NOT NULL,
  note TEXT,
  ranked_at TEXT
);

CREATE TABLE ratings (
  id INTEGER PRIMARY KEY,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  experience REAL NOT NULL CHECK (experience >= 1 AND experience <= 10),
  quality REAL NOT NULL CHECK (quality >= 1 AND quality <= 10),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (movie_id, user_id)
);

CREATE INDEX IF NOT EXISTS movies_ranked ON movies(ranked_at);
CREATE INDEX IF NOT EXISTS ratings_movie ON ratings(movie_id);
`

// Beli-style personal rankings. Independent of movies/ratings: its own movie
// list, one ordered (bucket, position) row per member per movie, and at most
// one in-progress binary search per member. Idempotent, so it runs on every
// open like CORE_SCHEMA. Scores are never stored; movie_beli derives them from
// position and bucket size.
const BELI_SCHEMA = `
CREATE TABLE IF NOT EXISTS beli_movies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL COLLATE NOCASE UNIQUE,
  submitter_id INTEGER NOT NULL REFERENCES users(id),
  submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beli_rankings (
  user_id INTEGER NOT NULL REFERENCES users(id),
  movie_id INTEGER NOT NULL REFERENCES beli_movies(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (bucket IN ('liked', 'fine', 'disliked')),
  position INTEGER NOT NULL CHECK (position >= 0),
  ranked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, movie_id),
  UNIQUE (user_id, bucket, position)
);

CREATE TABLE IF NOT EXISTS beli_pending (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  movie_id INTEGER NOT NULL REFERENCES beli_movies(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  started_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS beli_rankings_movie ON beli_rankings(movie_id);
`

const MOVIES_VERSION = 1

export function dbPath(): string {
  const explicit = process.env.CLUB_DB_PATH?.trim()
  if (explicit) return explicit
  const configuredDir = process.env.DATA_DIR?.trim()
  const dir =
    configuredDir ||
    (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build"
      ? "/data"
      : path.join(process.cwd(), "data"))
  return path.join(dir, "club.db")
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  )
}

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name)
}

function countRows(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }
  return row.c
}

function markMoviesSchema(db: Database.Database): void {
  db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT(version) DO NOTHING",
  ).run(MOVIES_VERSION, new Date().toISOString())
}

function ensureMovieShape(db: Database.Database): void {
  if (!columns(db, "movies").includes("ranked_at")) {
    db.exec("ALTER TABLE movies ADD COLUMN ranked_at TEXT")
  }
  const ratingCols = columns(db, "ratings")
  if (!ratingCols.includes("created_at")) {
    db.exec("ALTER TABLE ratings ADD COLUMN created_at TEXT NOT NULL DEFAULT ''")
    db.exec("UPDATE ratings SET created_at = updated_at WHERE created_at = ''")
  }
  db.exec("CREATE INDEX IF NOT EXISTS movies_ranked ON movies(ranked_at)")
  db.exec("CREATE INDEX IF NOT EXISTS ratings_movie ON ratings(movie_id)")
  markMoviesSchema(db)
}

// Rewrites the weekly schema (weeks + ratings.week_row_id) into movies.
// Closed weeks keep their lock time as ranked_at so an existing ranking
// replays in the order it was recorded. Open weeks with scores take the
// earliest rating time. Rows, ids, and account data stay put. Safe to run
// again: once `weeks` is gone this function is not entered.
function migrateLegacyWeeks(db: Database.Database): void {
  const weekCount = countRows(db, "weeks")
  const movieCount = tableExists(db, "movies") ? countRows(db, "movies") : 0
  if (weekCount > 0 && movieCount > 0) {
    throw new Error("Refusing to migrate: both movies and weeks contain rows.")
  }

  db.pragma("foreign_keys = OFF")
  try {
    const run = db.transaction(() => {
      if (!tableExists(db, "movies")) {
        db.exec(`CREATE TABLE movies (
          id INTEGER PRIMARY KEY,
          movie TEXT NOT NULL,
          suggester_id INTEGER NOT NULL REFERENCES users(id),
          suggested_at TEXT NOT NULL,
          note TEXT,
          ranked_at TEXT
        )`)
      }
      if (weekCount > 0 && countRows(db, "movies") === 0) {
        db.exec(`
          INSERT INTO movies (id, movie, suggester_id, suggested_at, note, ranked_at)
          SELECT
            weeks.id,
            weeks.movie,
            weeks.suggester_id,
            weeks.suggested_at,
            weeks.note,
            CASE
              WHEN weeks.status = 'closed' THEN COALESCE(weeks.closed_at, weeks.suggested_at)
              WHEN EXISTS (SELECT 1 FROM ratings WHERE ratings.week_row_id = weeks.id)
                THEN (SELECT MIN(ratings.updated_at) FROM ratings WHERE ratings.week_row_id = weeks.id)
              ELSE NULL
            END
          FROM weeks
        `)
      }

      const ratingCols = tableExists(db, "ratings") ? columns(db, "ratings") : []
      if (ratingCols.includes("week_row_id")) {
        db.exec(`CREATE TABLE ratings_next (
          id INTEGER PRIMARY KEY,
          movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          experience REAL NOT NULL CHECK (experience >= 1 AND experience <= 10),
          quality REAL NOT NULL CHECK (quality >= 1 AND quality <= 10),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (movie_id, user_id)
        )`)
        db.exec(`
          INSERT INTO ratings_next (id, movie_id, user_id, experience, quality, created_at, updated_at)
          SELECT id, week_row_id, user_id, experience, quality, updated_at, updated_at
          FROM ratings
        `)
        db.exec("DROP TABLE ratings")
        db.exec("ALTER TABLE ratings_next RENAME TO ratings")
      } else if (!tableExists(db, "ratings")) {
        db.exec(`CREATE TABLE ratings (
          id INTEGER PRIMARY KEY,
          movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id),
          experience REAL NOT NULL CHECK (experience >= 1 AND experience <= 10),
          quality REAL NOT NULL CHECK (quality >= 1 AND quality <= 10),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (movie_id, user_id)
        )`)
      }

      db.exec("DROP TABLE IF EXISTS weeks")
      ensureMovieShape(db)
    })
    run()
  } finally {
    db.pragma("foreign_keys = ON")
  }

  const violations = db.pragma("foreign_key_check") as unknown[]
  if (violations.length > 0) {
    throw new Error(`Movie schema migration failed foreign key check: ${JSON.stringify(violations)}`)
  }
}

export function migrate(db: Database.Database): void {
  db.exec(CORE_SCHEMA)
  db.exec(BELI_SCHEMA)
  if (tableExists(db, "weeks")) {
    migrateLegacyWeeks(db)
    return
  }
  if (!tableExists(db, "movies")) {
    db.exec(MOVIE_SCHEMA)
  }
  ensureMovieShape(db)
}

export function getDb(): Database.Database {
  const file = dbPath()
  if (globalForDb.__reelDb && globalForDb.__reelDbPath !== file) {
    globalForDb.__reelDb.close()
    globalForDb.__reelDb = undefined
  }
  if (!globalForDb.__reelDb) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const db = new Database(file)
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    db.pragma("busy_timeout = 3000")
    migrate(db)
    globalForDb.__reelDb = db
    globalForDb.__reelDbPath = file
  }
  return globalForDb.__reelDb
}

export function closeDb(): void {
  globalForDb.__reelDb?.close()
  globalForDb.__reelDb = undefined
  globalForDb.__reelDbPath = undefined
}
