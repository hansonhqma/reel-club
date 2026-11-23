import { getDb } from "../src/lib/db"
import { readRatingEvents } from "../src/lib/rating-events"
import { SHAWSHANK_REOPEN_REASON } from "../src/lib/shawshank-reopen"
import { closeUtrMovie, getOpenUtrMovie, startUtrRating, utrCloses } from "../src/lib/utr"
import { utrOpenRoster } from "../src/lib/utr-roster"

// Fork-only. Production start does not run this file.
if (process.env.SHAWSHANK_FORK_SIM !== "1") {
  console.log("SHAWSHANK_SIM skipped")
  process.exit(0)
}

const db = getDb()
const lists = () =>
  db.prepare("SELECT user_id, movie_id, bucket, position FROM utr_lists ORDER BY user_id, bucket, position").all()
const open = getOpenUtrMovie()
const beforeLists = lists()
const rosterBefore = open ? utrOpenRoster(open.id, 5) : []
if (!open) throw new Error("Shawshank did not reopen")
const rated = startUtrRating(5, open.id, "a_lot")
const stillOpen = getOpenUtrMovie()
const listsAfterRate = lists()
closeUtrMovie(1, open.id)
const closed = getOpenUtrMovie()
const closes = utrCloses()
const event = readRatingEvents(db).find((row) => row.type === "utr.movie.reopened")
console.log(
  "SHAWSHANK_AFTER " +
    JSON.stringify({
      reopened: {
        id: open.id,
        title: open.title,
        suggesterId: open.suggesterId,
        suggesterName: open.suggesterName,
      },
      rosterBefore: rosterBefore.map((row) => ({ name: row.name, kind: row.kind, bucket: row.bucket })),
      jasonStep: rated,
      stillOpenAfterJason: stillOpen?.id ?? null,
      othersListsUnchanged: JSON.stringify(listsAfterRate.filter((row) => (row as { user_id: number }).user_id !== 5)) ===
        JSON.stringify(beforeLists.filter((row) => (row as { user_id: number }).user_id !== 5)),
      closedAfterAdmin: closed == null,
      event: event
        ? { actorId: event.actorId, reason: event.payload.reason, userId: event.payload.userId }
        : null,
      expectedReason: SHAWSHANK_REOPEN_REASON,
      close: closes.at(-1)
        ? {
            seq: closes.at(-1)?.seq,
            elo: closes.at(-1)?.elo,
            fromNew: closes.at(-1)?.fromNew,
            fromOlder: closes.at(-1)?.fromOlder,
            ranks: Object.fromEntries(Object.entries(closes.at(-1)?.ranks ?? {}).map(([name, rank]) => [name, rank.label])),
          }
        : null,
    }),
)
