import type Database from "better-sqlite3"
import { appendRatingEvent } from "@/lib/rating-events"
import { bucketForBlended, bucketFromLegacy, type UtrBucket } from "@/lib/utr-score"
import { recordUtrCloses } from "@/lib/utr-elo"

export const UTR_MIGRATION = 4

export const UTR_SCHEMA = `
CREATE TABLE IF NOT EXISTS utr_members (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  active INTEGER NOT NULL CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS utr_movies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  suggester_id INTEGER NOT NULL REFERENCES users(id),
  suggested_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  closed_at TEXT,
  close_reason TEXT CHECK (close_reason IN ('complete', 'early', 'seed')),
  seq INTEGER
);

CREATE TABLE IF NOT EXISTS utr_responses (
  movie_id INTEGER NOT NULL REFERENCES utr_movies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('rate', 'skip')),
  bucket TEXT CHECK (bucket IN ('a_lot', 'kinda', 'not_really')),
  answers TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (movie_id, user_id)
);

CREATE TABLE IF NOT EXISTS utr_lists (
  user_id INTEGER NOT NULL REFERENCES users(id),
  movie_id INTEGER NOT NULL REFERENCES utr_movies(id),
  bucket TEXT NOT NULL CHECK (bucket IN ('a_lot', 'kinda', 'not_really')),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (user_id, movie_id),
  UNIQUE (user_id, bucket, position)
);

CREATE TABLE IF NOT EXISTS utr_pending (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  movie_id INTEGER NOT NULL REFERENCES utr_movies(id),
  state TEXT NOT NULL,
  started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS utr_closes (
  movie_id INTEGER PRIMARY KEY REFERENCES utr_movies(id),
  seq INTEGER NOT NULL,
  scores_json TEXT NOT NULL,
  elo_json TEXT NOT NULL,
  from_new_json TEXT NOT NULL,
  from_older_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS utr_movies_status ON utr_movies(status);
CREATE INDEX IF NOT EXISTS utr_lists_user ON utr_lists(user_id, bucket, position);
`

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function normTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

type SeedMovie = {
  key: string
  title: string
  suggesterId: number
  at: string
  source: "elo" | "beli"
}

type SeedEntry = { key: string; bucket: UtrBucket }

export function seedUtrFromLegacy(db: Database.Database): void {
  if (!tableExists(db, "schema_migrations") || !tableExists(db, "users") || !tableExists(db, "utr_movies")) return
  const already = db.prepare("SELECT 1 AS ok FROM schema_migrations WHERE version = ?").get(UTR_MIGRATION)
  if (already) return

  const tx = db.transaction(() => {
    const users = db
      .prepare("SELECT id, name FROM users ORDER BY id ASC")
      .all() as { id: number; name: string }[]
    const activate = db.prepare(
      "INSERT INTO utr_members (user_id, active) VALUES (?, 1) ON CONFLICT(user_id) DO NOTHING",
    )
    for (const user of users) activate.run(user.id)

    const eloMovies = tableExists(db, "movies")
      ? (db
          .prepare(
            `SELECT id, movie, suggester_id, suggested_at, ranked_at FROM movies ORDER BY id ASC`,
          )
          .all() as {
          id: number
          movie: string
          suggester_id: number
          suggested_at: string
          ranked_at: string | null
        }[])
      : []
    const eloByKey = new Map<string, (typeof eloMovies)[number]>()
    for (const movie of eloMovies) {
      const key = normTitle(movie.movie)
      const previous = eloByKey.get(key)
      if (!previous || movie.suggested_at < previous.suggested_at) eloByKey.set(key, movie)
    }

    const beliMovies = tableExists(db, "beli_movies")
      ? (db.prepare("SELECT id, title, submitter_id, submitted_at FROM beli_movies ORDER BY id ASC").all() as {
          id: number
          title: string
          submitter_id: number
          submitted_at: string
        }[])
      : []
    const beliByKey = new Map<string, (typeof beliMovies)[number]>()
    for (const movie of beliMovies) beliByKey.set(normTitle(movie.title), movie)

    const lists = new Map<number, SeedEntry[]>()
    const needed = new Map<string, SeedMovie>()

    const remember = (entry: Omit<SeedMovie, "key"> & { key?: string }) => {
      const key = normTitle(entry.title)
      const existing = needed.get(key)
      if (!existing) {
        needed.set(key, { ...entry, key, title: entry.title.trim().replace(/\s+/g, " ") })
        return
      }
      if (entry.at < existing.at) existing.at = entry.at
      if (entry.source === "elo") {
        existing.source = "elo"
        existing.suggesterId = entry.suggesterId
        existing.title = entry.title.trim().replace(/\s+/g, " ")
      }
    }

    for (const user of users) {
      const beliCount = tableExists(db, "beli_rankings")
        ? ((db.prepare("SELECT COUNT(*) AS c FROM beli_rankings WHERE user_id = ?").get(user.id) as { c: number }).c)
        : 0
      const entries: SeedEntry[] = []
      if (beliCount > 0) {
        const rows = db
          .prepare(
            `SELECT beli_movies.title, beli_movies.submitter_id, beli_movies.submitted_at,
                    beli_rankings.bucket, beli_rankings.position
             FROM beli_rankings
             JOIN beli_movies ON beli_movies.id = beli_rankings.movie_id
             WHERE beli_rankings.user_id = ?
             ORDER BY CASE beli_rankings.bucket WHEN 'liked' THEN 0 WHEN 'fine' THEN 1 ELSE 2 END,
                      beli_rankings.position ASC, beli_movies.id ASC`,
          )
          .all(user.id) as {
          title: string
          submitter_id: number
          submitted_at: string
          bucket: string
          position: number
        }[]
        for (const row of rows) {
          const bucket = bucketFromLegacy(row.bucket)
          if (!bucket) continue
          const elo = eloByKey.get(normTitle(row.title))
          remember({
            title: elo?.movie ?? row.title,
            suggesterId: elo?.suggester_id ?? row.submitter_id,
            at: elo?.ranked_at ?? elo?.suggested_at ?? row.submitted_at,
            source: elo ? "elo" : "beli",
          })
          entries.push({ key: normTitle(row.title), bucket })
        }
      } else if (tableExists(db, "ratings")) {
        const rows = db
          .prepare(
            `SELECT movies.movie, movies.suggester_id, movies.suggested_at, movies.ranked_at,
                    ratings.experience, ratings.quality
             FROM ratings
             JOIN movies ON movies.id = ratings.movie_id
             WHERE ratings.user_id = ?
             ORDER BY movies.id ASC`,
          )
          .all(user.id) as {
          movie: string
          suggester_id: number
          suggested_at: string
          ranked_at: string | null
          experience: number
          quality: number
        }[]
        const ranked = rows
          .map((row) => ({
            ...row,
            blended: (row.experience + row.quality) / 2,
          }))
          .sort((a, b) => b.blended - a.blended || normTitle(a.movie).localeCompare(normTitle(b.movie)))
        for (const row of ranked) {
          remember({
            title: row.movie,
            suggesterId: row.suggester_id,
            at: row.ranked_at ?? row.suggested_at,
            source: "elo",
          })
          entries.push({ key: normTitle(row.movie), bucket: bucketForBlended(row.blended) })
        }
      }
      lists.set(user.id, entries)
    }

    const ordered = [...needed.values()].sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
    const idByKey = new Map<string, number>()
    const stamp = migrationStamp(db)
    for (const movie of ordered) {
      const info = db
        .prepare(
          `INSERT INTO utr_movies (title, suggester_id, suggested_at, status, closed_at, close_reason, seq)
           VALUES (?, ?, ?, 'closed', ?, 'seed', ?)`,
        )
        .run(movie.title, movie.suggesterId, movie.at, movie.at, idByKey.size + 1)
      const movieId = Number(info.lastInsertRowid)
      idByKey.set(movie.key, movieId)
      appendRatingEvent(db, {
        actorId: movie.suggesterId,
        type: "utr.movie.seeded",
        movieId,
        occurredAt: stamp,
        backfilled: true,
        payload: {
          title: movie.title,
          suggesterId: movie.suggesterId,
          at: movie.at,
          source: movie.source,
          seq: idByKey.size,
        },
      })
    }

    const insertList = db.prepare(
      `INSERT INTO utr_lists (user_id, movie_id, bucket, position) VALUES (?, ?, ?, ?)`,
    )
    const insertResponse = db.prepare(
      `INSERT INTO utr_responses (movie_id, user_id, kind, bucket, answers, updated_at)
       VALUES (?, ?, 'rate', ?, '[]', ?)`,
    )
    for (const user of users) {
      const entries = lists.get(user.id) ?? []
      const positions: Record<UtrBucket, number> = { a_lot: 0, kinda: 0, not_really: 0 }
      const payloadEntries: { movieId: number; title: string; bucket: UtrBucket }[] = []
      for (const entry of entries) {
        const movieId = idByKey.get(entry.key)
        const movie = ordered.find((item) => item.key === entry.key)
        if (movieId == null || !movie) continue
        const position = positions[entry.bucket]
        positions[entry.bucket] += 1
        insertList.run(user.id, movieId, entry.bucket, position)
        insertResponse.run(movieId, user.id, entry.bucket, movie.at)
        payloadEntries.push({ movieId, title: movie.title, bucket: entry.bucket })
      }
      appendRatingEvent(db, {
        actorId: user.id,
        type: "utr.list.seeded",
        occurredAt: stamp,
        backfilled: true,
        payload: { userId: user.id, source: beliSource(db, user.id) ? "beli" : "blended", entries: payloadEntries },
      })
    }

    appendRatingEvent(db, {
      actorId: users[0]?.id ?? 0,
      type: "utr.seed.closed",
      occurredAt: stamp,
      backfilled: true,
      payload: { movies: ordered.length },
    })
    recordUtrCloses(db)

    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      UTR_MIGRATION,
      new Date().toISOString(),
    )
  })
  tx()
}

function migrationStamp(db: Database.Database): string {
  const latest = db.prepare("SELECT MAX(occurred_at) AS t FROM rating_events").get() as { t: string | null }
  const now = new Date().toISOString()
  if (!latest.t || now > latest.t) return now
  return latest.t
}

function beliSource(db: Database.Database, userId: number): boolean {
  if (!tableExists(db, "beli_rankings")) return false
  return ((db.prepare("SELECT COUNT(*) AS c FROM beli_rankings WHERE user_id = ?").get(userId) as { c: number }).c) > 0
}

export function ensureUtrMember(db: Database.Database, userId: number): void {
  if (!tableExists(db, "utr_members")) return
  db.prepare("INSERT INTO utr_members (user_id, active) VALUES (?, 1) ON CONFLICT(user_id) DO NOTHING").run(userId)
}
