import type Database from "better-sqlite3"
import { appendRatingEvent } from "@/lib/rating-events"

export const SHAWSHANK_REOPEN_MIGRATION = 5
export const SHAWSHANK_REOPEN_REASON = "admin one-time reopen for Jason"
export const SHAWSHANK_TITLE = "The Shawshank Redemption"

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name))
}

function normTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase().replace(/^the /, "")
}

function isShawshank(title: string): boolean {
  return normTitle(title) === "shawshank redemption"
}

function mark(db: Database.Database): void {
  db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
    SHAWSHANK_REOPEN_MIGRATION,
    new Date().toISOString(),
  )
}

// One-time exception so Jason can rate the seeded Shawshank close.
// Everyone else's responses and list rows stay. The suggester stays.
// The derived close snapshot stays until the movie closes again; that close
// rebuilds through the normal path and shows the change from this snapshot.
export function reopenShawshankForJason(db: Database.Database): void {
  if (!tableExists(db, "schema_migrations") || !tableExists(db, "utr_movies") || !tableExists(db, "users")) return
  const already = db.prepare("SELECT 1 AS ok FROM schema_migrations WHERE version = ?").get(SHAWSHANK_REOPEN_MIGRATION)
  if (already) return

  const tx = db.transaction(() => {
    const open = db.prepare("SELECT id FROM utr_movies WHERE status = 'open' LIMIT 1").get()
    const movies = db.prepare("SELECT id, title, status, suggester_id FROM utr_movies").all() as {
      id: number
      title: string
      status: string
      suggester_id: number
    }[]
    const target = movies.filter((movie) => movie.status === "closed" && isShawshank(movie.title))
    const jason = db
      .prepare("SELECT id FROM users WHERE username = 'jason' COLLATE NOCASE")
      .get() as { id: number } | undefined
    const admin = db
      .prepare("SELECT id FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1")
      .get() as { id: number } | undefined
    const onlyThisMovie = movies.length === 1 && target.length === 1
    const jasonReady =
      jason != null &&
      target.length === 1 &&
      Boolean(
        db
          .prepare("SELECT 1 AS ok FROM utr_members WHERE user_id = ? AND active = 1")
          .get(jason.id),
      ) &&
      !db.prepare("SELECT 1 AS ok FROM utr_responses WHERE movie_id = ? AND user_id = ?").get(target[0].id, jason.id)

    if (open || !onlyThisMovie || !jasonReady || !admin || !jason || target.length !== 1) {
      mark(db)
      return
    }

    const movie = target[0]
    db.prepare(
      `UPDATE utr_movies
       SET status = 'open', closed_at = NULL, close_reason = NULL
       WHERE id = ?`,
    ).run(movie.id)
    db.prepare("DELETE FROM utr_pending WHERE movie_id = ?").run(movie.id)
    appendRatingEvent(db, {
      actorId: admin.id,
      type: "utr.movie.reopened",
      movieId: movie.id,
      payload: {
        movieId: movie.id,
        title: movie.title,
        reason: SHAWSHANK_REOPEN_REASON,
        userId: jason.id,
        username: "jason",
      },
    })
    mark(db)
  })
  tx()
}
