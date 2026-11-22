# UTR backend

One open movie. Each active member places it on a personal list or chooses "I didn't watch." The list updates as soon as the slot is chosen. Elo is rebuilt from those lists only when the movie closes. Old `movies`, `ratings`, and `beli_*` rows stay where they are.

The flow you can click is `/utr`. The real pages can call the functions below.

## Server functions

All of these take the signed-in user's id. They throw `UtrError` with a `message` safe to show and a `code`.

| Function | What it does |
| --- | --- |
| `suggestUtrMovie(userId, title)` | Opens a movie. Refused while one is already open. |
| `getOpenUtrMovie()` | The open movie, or null. |
| `startUtrRating(userId, movieId, bucket)` | `bucket` is `a_lot`, `kinda`, or `not_really`. Starts comparisons against that group. An empty group saves the slot immediately. Replaces a draft if this movie is still open. |
| `answerUtrRating(userId, movieId, "new" \| "old" \| "back", historyLength)` | One comparison. `new` places it above the pivot, `old` below. Pass `historyLength` from the pending step so a double submit is refused. |
| `restartUtrRating(userId, movieId)` | Throws away the draft, including a slot already saved for this open movie. |
| `skipUtrMovie(userId, movieId)` | "I didn't watch." Allowed for the suggester too. |
| `closeUtrMovie(userId, movieId)` | Suggester or admin. Everyone still silent, including a silent suggester, is stored as didn't-watch. No timer. |
| `leaveUtrClub(userId)` | Stops blocking later movies. Old ratings stay in Elo. |
| `utrList(userId)` | Personal list, best first, with 0–10 Beli-band scores. |
| `utrPending(userId, movieId)` | The current comparison, or null. |
| `utrCloses()` | One row per closed movie: Elo after the rebuild, plus `fromNew` and `fromOlder` by member name. They add up to the change since the previous close. |
| `questionBudgetFor(userId, bucket)` | Most questions that group will ask. |

Buckets: **A lot** 7.0–10.0 (alone 8.5), **Kinda** 4.0–6.9 (alone 5.5), **Not really** 0.0–3.9 (alone 2.0). There is no "too tough." A movie that is alone in its group sits on the baseline, so an old 8 and an old 9 in the same group both become 8.5 until a second movie joins that group.

`UtrError.code` is one of `no_user`, `inactive`, `bad_title`, `movie_open`, `suggest_failed`, `bad_bucket`, `not_open`, `search_open`, `no_search`, `stale_step`, `bad_answer`, `forbidden`. `stale_step` means the comparison on screen was already sent. Show `error.message`.

Elo uses `movie_elo` with scale 0–10. Both of the old score fields are this list score. The suggester's score stays on their list and is left out of the match for their own movie. A movie nobody except the suggester rated does not enter Elo. The first closed movie also does not move the board: there is no earlier pick to play, so everyone stays at 1500 until a second movie closes.

## Actions

`src/app/utr/actions.ts` wraps the same calls for forms: `suggestUtrAction`, `startUtrAction`, `answerUtrAction`, `restartUtrAction`, `skipUtrAction`, `closeUtrAction`.

## Migration

Version 4 runs once. A member with any Beli rankings keeps that order and those groups, and their old Elo scores are not mixed in. Everyone else is seeded from `(enjoyment + quality) / 2`, highest first, title as the tie-break, with 7 and 4 as the cuts. Movies nobody scored and that nobody ranked on Beli are not copied. No comparison steps are invented. Seeded movies are closed, in order of the old `ranked_at`, otherwise the suggestion or submit time. Because the seeded lists are complete before that replay, the re-sort half of those historical closes is zero. The old movie, rating, and Beli tables stay. The new board will not match the old Elo board: the scale is 0–10, the suggester is left out of their own movie, and a lone score becomes the band baseline.

## Differences from the prototype

- The suggester may choose "I didn't watch." The prototype rejected that. An early close still records a silent suggester the same way.
- Back and start over are stored while the movie is open, because the questions span more than one request. Elo uses only the committed answers. After close, nothing on that movie can change.
- Historical closes use the finished seeded lists for every old movie. They are not a reconstruction of each night's list.
- The previous Elo and Beli pages still read the old tables.
