import { getDb } from "@/lib/db"
import type { UtrBucket } from "@/lib/utr-score"

export type UtrRosterEntry = {
  userId: number
  name: string
  kind: "rate" | "skip" | null
  bucket: UtrBucket | null
}

type RosterRow = {
  user_id: number
  name: string
  kind: string | null
  bucket: string | null
}

function asBucket(value: string | null): UtrBucket | null {
  if (value === "a_lot" || value === "kinda" || value === "not_really") return value
  return null
}

// Active members and whether they have answered the open movie.
// The rating module records responses but does not list them.
export function utrOpenRoster(movieId: number): UtrRosterEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT users.id AS user_id, users.name AS name, utr_responses.kind AS kind, utr_responses.bucket AS bucket
       FROM utr_members
       JOIN users ON users.id = utr_members.user_id
       LEFT JOIN utr_responses
         ON utr_responses.user_id = users.id AND utr_responses.movie_id = ?
       WHERE utr_members.active = 1
       ORDER BY users.name COLLATE NOCASE`,
    )
    .all(movieId) as RosterRow[]
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    kind: row.kind === "rate" || row.kind === "skip" ? row.kind : null,
    bucket: asBucket(row.bucket),
  }))
}

export function utrActiveNames(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT users.name AS name
       FROM utr_members
       JOIN users ON users.id = utr_members.user_id
       WHERE utr_members.active = 1
       ORDER BY users.name COLLATE NOCASE`,
    )
    .all() as { name: string }[]
  return rows.map((row) => row.name)
}
