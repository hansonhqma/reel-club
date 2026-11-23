# Rating event log

`rating_events` is an append-only log of actions that change who is in the club or how Elo and Beli rankings are built. Sequence `id` is the replay order. `occurred_at` is the time the row was written. Replay does not sort by `occurred_at`, does not read the clock, and does not use randomness.

Elo standings and Beli scores are not stored in the log. They are derived by replaying raw inputs through the current engines. A later ranking system can read the same inputs.

Rows are never updated or deleted. The table has no foreign keys, so removing a movie or a rating cannot cascade into the log. Corrections are new events.

## Schema

```sql
CREATE TABLE rating_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL, -- payload shape, currently 1
  movie_id INTEGER,                 -- elo movie or beli movie, when there is one
  other_id INTEGER,                 -- unused today, reserved for a second target
  payload TEXT NOT NULL,            -- JSON object, keys stored in sorted order
  backfilled INTEGER NOT NULL CHECK (backfilled IN (0, 1))
);
```

`schema_version` is `1`. Payloads hold the inputs that were saved (titles, scores, answers, timestamps the app stored). They do not hold Elo deltas or Beli scores.

Password hashes, session tokens, and the invite code are not written.

## Event types

| Type | When | Payload |
| --- | --- | --- |
| `member.joined` | Invite signup, admin create, bootstrap admin, demo seed, or backfill | `userId`, `username`, `name`, `isAdmin`, `via` |
| `elo.movie.suggested` | A movie is suggested | `title`, `note`, `suggestedAt`, `suggesterId`, `rankedAt` |
| `elo.movie.removed` | Suggester or admin removes an unscored suggestion | `title`, `note`, `suggestedAt`, `suggesterId` |
| `elo.rating.set` | First enjoyment and quality pair for a member on a movie | `experience`, `quality`, `at` |
| `elo.rating.changed` | A later edit of that pair | `experience`, `quality`, `at`, `previous` |
| `elo.rating.removed` | An existing pair is dropped. `actor_id` may be an admin; `userId` is the rater | `userId`, `experience`, `quality`, `at`, `updatedAt`, `reason` |
| `beli.movie.submitted` | A Beli title is added | `title`, `submittedAt`, `submitterId` |
| `beli.movie.deleted` | Submitter or admin deletes a title. Ranked deletes require confirm | `title`, `submitterId`, `confirmed`, `hadRankings` |
| `beli.bucket.chosen` | A member picks Liked, Fine, or Didn't like | `movieId`, `title`, `bucket`, `rerank` |
| `beli.comparison.answered` | Better (`new`), worse (`old`), too tough, or Back | `movieId`, `title`, `bucket`, `answer` |
| `beli.ranking.placed` | A search inserted the movie, or a backfilled placement | `movieId`, `title`, `bucket`, and `index` or backfill `position` |
| `beli.list.removed` | Removed from my list | `movieId`, `title`, `bucket`, `dropPending` |
| `beli.search.started` | The engine was asked to start a search, including a bucket choice that places the movie with no questions. `startedAt` is set only when a pending row is stored. Backfill uses this type for a pending snapshot | `movieId`, `title`, `bucket`, `rerank`, optional `startedAt`, and `insertion` when backfilled |
| `beli.search.resumed` | Same movie and bucket started again, or a page view that moved the search | `movieId`, `title`, `bucket` |
| `beli.search.abandoned` | Start over, a replaced search, a removal that drops the search, or the engine rejecting the step | `movieId`, `reason`, optional `detail` and `answer` |
| `utr.movie.seeded` | Migration copies one old title into the unified list | `title`, `suggesterId`, `at`, `source`, `seq` |
| `utr.list.seeded` | Migration copies one member's starting order. No comparison steps | `userId`, `source` (`beli` or `blended`), `entries` |
| `utr.seed.closed` | Those seeded movies are closed and Elo is rebuilt once | `movies` |
| `utr.movie.suggested` | A member opens the next movie | `title`, `suggesterId` |
| `utr.bucket.chosen` | Enjoyment group chosen. Starts a search, or places the movie when the group is empty | `movieId`, `title`, `bucket`, `candidateIds` |
| `utr.comparison.answered` | Better (`new`), worse (`old`), or Back | `movieId`, `title`, `bucket`, `answer` |
| `utr.rating.committed` | The slot is saved. This is the insert; the answers before it are not | `movieId`, `title`, `bucket`, `answers`, `index` |
| `utr.search.restarted` | Draft thrown away while the movie is still open | `movieId`, `title` |
| `utr.skipped` | "I didn't watch", including a silent member on an early close (`automatic`) | `movieId`, `title`, optional `automatic` |
| `utr.movie.closed` | Every active member has answered, or the suggester or an admin closed early | `movieId`, `title`, `reason`, `autoSkipped` |
| `utr.movie.reopened` | One-time migration puts the seeded Shawshank close back in play for Jason. Earlier answers stay | `movieId`, `title`, `reason`, `userId`, `username` |
| `utr.member.left` | The member stops blocking later movies. Old scores stay | `userId` |

`reduceRatingEvents` ignores `utr.*` events. The unified list has its own replay. See `docs/utr.md`.

Each write of club state and its events share one SQLite transaction.

The app still has no screen for clearing one score or saving only one of the two numbers. `elo.rating.removed` is a new event, not an edit of `elo.rating.set`. Migration version 3 uses it, with `elo.movie.removed` and `beli.movie.deleted`, to drop movies the club did not watch. It targets Elo ids 2 and 3 only while they have zero ratings, Elo id 1 together with its ratings, and Beli id 1, and only when the stored title still matches. The actor is user 1. Shawshank (Elo id 4) is not selected.

A page view that reloads the current Beli question and does not move `lo`, `hi`, history, or the candidate list is not logged.

`actor_id` is the member who joined, except admin-created accounts, where it is the admin. `payload.userId` is always the new member.

## Backfill

The first time a database is opened after this table exists, migration version `2` copies current rows into synthetic events and sets `backfilled` to 1. Every row is one event on a single timeline. The timestamp is the row's own time: `users.created_at`, `movies.suggested_at`, `ratings.created_at`, `beli_movies.submitted_at`, `beli_rankings.ranked_at`, or `beli_pending.started_at`.

That time is clamped forward when it would precede something the event needs. A movie waits for its suggester or submitter to join. A rating waits for its movie and its rater. A Beli placement or pending search waits for its movie and its member. Clamping sets `occurred_at` to the later dependency time. The payload keeps the original time (`suggestedAt`, `at`, `rankedAt`, `startedAt`), and Elo replay still orders weeks by `rankedAt`.

Equal timestamps break ties in this order: kind priority, then source row id, then actor id. Kind priority, lowest first, is `member.joined`, `elo.movie.suggested`, `beli.movie.submitted`, `elo.rating.set`, `beli.ranking.placed`, `beli.search.started`. Source ids are `users.id`, `movies.id`, `ratings.id`, `beli_movies.id`, `beli_rankings.movie_id`, and `beli_pending.user_id`. The same inputs always produce the same sequence.

An empty database still records version 2, so later activity is not mistaken for history.

Migration version 4 then copies the surviving rows into a UTR list. Those events are `backfilled`. `occurred_at` is the migration time, at or after the last existing event, so the log does not move backwards. The historical time stays in the payload (`at`). Version 4 is recorded even when there is nothing to copy.

What cannot be recovered:

- Elo edits that were overwritten. Only the current pair remains, plus `created_at` and `updated_at`.
- The original weekly `week_id` strings. Those were already dropped by the movie migration. Replay uses movie id and `rankedAt`.
- Beli answers, Back, Start over, and abandoned searches that finished before the log existed. Placements are the final bucket and position only.
- The pending insertion can be restored, but not the questions that produced it.
- Whether a backfilled member joined by invite, admin, bootstrap, or seed. `via` is `backfill`.

## Replay

`reduceRatingEvents` walks events in the order given. `readRatingEvents` supplies `ORDER BY id`. It rebuilds members, Elo movies and ratings, Beli titles, each member's three lists, and pending searches.

Live Beli steps call `movie_beli` again with the recorded bucket, rerank flag, and answers. Backfilled placements are applied by position. Backfilled pending rows are restored from the snapshot and are not re-simulated. Non-backfill `beli.ranking.placed` is a marker; the preceding start or answer already applied the insert.

`eloWeeksFromModel` builds the same week list the app sends to `movie_elo`: members in id order, scored movies by `rankedAt` then id, raters by case-insensitive name.

## Export

Admins can `GET /admin/rating-events`. The body is JSONL. The route is not linked from the pages.

Someone with the database file can run:

```bash
npx tsx scripts/export-rating-events.ts
```

## Open choices

- Page-load peeks that do not move the search are omitted. Logging them would make every visit an event.
- `beli.ranking.placed` does not store the resulting score or the full list. Replay asks the current engine.
- Deleting a Beli title leaves gaps in `beli_rankings.position`. Replay keeps the surviving order, which is what the engine sees. It does not reproduce the gap numbers.
- There is still no Elo "clear my score" action.
