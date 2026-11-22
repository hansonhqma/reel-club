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
| `utrCloses()` | One row per closed movie: Elo, `fromNew`, `fromOlder`, `ranks`, and `ratedPicks`, by member name. The Elo parts add up to the change since the previous close. |
| `utrBoard()` | The latest close, one row per member: Elo, rank, and rated-pick count, best Elo first. Null before any movie has closed. |
| `questionBudgetFor(userId, bucket)` | Most questions that group will ask. |

Buckets: **A lot** 7.0–10.0 (alone 8.5), **Kinda** 4.0–6.9 (alone 5.5), **Not really** 0.0–3.9 (alone 2.0). There is no "too tough." A movie that is alone in its group sits on the baseline, so an old 8 and an old 9 in the same group both become 8.5 until a second movie joins that group.

`UtrError.code` is one of `no_user`, `inactive`, `bad_title`, `movie_open`, `suggest_failed`, `bad_bucket`, `not_open`, `search_open`, `no_search`, `stale_step`, `bad_answer`, `forbidden`. `stale_step` means the comparison on screen was already sent. Show `error.message`.

Elo uses `movie_elo` with scale 0–10. Both of the old score fields are this list score. The suggester's score stays on their list and is left out of the match for their own movie. A movie nobody except the suggester rated does not enter Elo. The first closed movie also does not move the board: there is no earlier pick to play, so everyone stays at 1500 until a second movie closes.

The step size is the spicy tuning. `d` is 1.25, so a 1.25-point gap on the list is about a 91% win. `K` is `160 / (n − 1)`. `n` is the Elo roster at that close: everyone who has joined, including anyone who has left. Leaving does not shrink `n`, because a leaver stays in the league. Six people gives `K = 32`. A roster of one has no match, so `K` stays at the engine default of 32. `movie_elo` takes both numbers as parameters, and each close's rebuild uses the roster size at that close. An older close keeps the Elo it stored.

## Ranks

A rank is a label on Elo. `ranks[name]` is `{ tier, division, label }`. Master, Grandmaster, and Challenger have no division. Everyone starts in **Silver II** (1480–1519). The member steps up the moment Elo crosses a line, and steps down only after Elo is 10 points below the line they are holding. That memory walks the closes in order, so the label is not a function of the current Elo alone.

| Rank | Elo |
| --- | --- |
| Iron IV | below 1120 |
| Iron III–I | 1120, 1160, 1200 |
| Bronze IV–I | 1240, 1280, 1320, 1360 |
| Silver IV–I | 1400, 1440, 1480, 1520 |
| Gold IV–I | 1560, 1600, 1640, 1680 |
| Platinum IV–I | 1720, 1740, 1760, 1780 |
| Emerald IV–I | 1800, 1830, 1860, 1890 |
| Diamond IV–I | 1920, 1960, 2000, 2040 |
| Master | 2080 |

Challenger and Grandmaster are chairs, not score lines. A rated pick is a movie they suggested that at least one other member scored. `ratedPicks[name]` is that count as of the close.

- **Challenger** is only the current #1, with Elo at least 1800 and at least 6 rated picks.
- **Grandmaster** is only the current #2, and only while someone is Challenger, with Elo at least 1720 and at least 6 rated picks.
- If the leader is not there yet, both chairs stay empty. Second place does not become Challenger.
- A tie breaks by name, A to Z.

## Actions

`src/app/utr/actions.ts` wraps the same calls for forms: `suggestUtrAction`, `startUtrAction`, `answerUtrAction`, `restartUtrAction`, `skipUtrAction`, `closeUtrAction`.

## Migration

Version 4 runs once. A member with any Beli rankings keeps that order and those groups, and their old Elo scores are not mixed in. Everyone else is seeded from `(enjoyment + quality) / 2`, highest first, title as the tie-break, with 7 and 4 as the cuts. Movies nobody scored and that nobody ranked on Beli are not copied. No comparison steps are invented. Seeded movies are closed, in order of the old `ranked_at`, otherwise the suggestion or submit time. Because the seeded lists are complete before that replay, the re-sort half of those historical closes is zero. The old movie, rating, and Beli tables stay. The new board will not match the old Elo board: the scale is 0–10, the suggester is left out of their own movie, and a lone score becomes the band baseline.

## Differences from the prototype

- The suggester may choose "I didn't watch." The prototype rejected that. An early close still records a silent suggester the same way.
- Back and start over are stored while the movie is open, because the questions span more than one request. Elo uses only the committed answers. After close, nothing on that movie can change.
- Historical closes use the finished seeded lists for every old movie. They are not a reconstruction of each night's list.
- The previous Elo and Beli pages still read the old tables.
