# One rating system: taste lists that feed Elo

This is a prototype. It does not change the live site.

The club would stop keeping two games. Every person who watched a movie answers one comparative rating. That rating updates their personal list immediately. The shared Elo board updates only when the movie closes, and it uses numbers compiled from those lists. A closed rating is final. Nobody edits it later.

## The night, in order

Only one movie is open. The next suggestion waits until this one has closed.

1. Someone suggests movie A. They are the suggester.
2. Every active member either rates A or chooses "I didn't watch."
3. A rating starts with "How much did you enjoy it?": **not really**, **kinda**, or **a lot**.
4. The site then asks "which did you enjoy more?" against movies already in that same enjoyment group, until the new movie has one clear slot.
5. That slot is inserted into the member's taste list. Their personal ranking updates at once.
6. When every active member has answered, the movie closes. Those answers are frozen.
7. Every taste list is turned into a number for every movie that person has rated. The whole Elo history is replayed from scratch with those numbers.

Someone who has left does not have to answer, and does not block the close. Someone who joins while a movie is open does have to answer it.

## The taste list

Each member has one ordering of every movie they have rated. It is three groups, best first inside each group, and the groups themselves never mix:

| Enjoyment | Sits | Score band | A movie alone in the group |
|---|---|---|---|
| A lot | above the others | 7.0 to 10.0 | 8.5 |
| Kinda | in the middle | 4.0 to 6.9 | 5.5 |
| Not really | at the bottom | 0.0 to 3.9 | 2.0 |

These are the same bands as today's Beli lists. The top of a group is the high end of the band. The bottom is the low end. Movies in between are spaced evenly and rounded to a tenth, half up. Two movies someone loved are 10.0 and 7.0. A third movie slots in and the older numbers move.

The personal list is that order. Call the compiled numbers the member's scores.

### Comparisons

Inside the chosen group, placement is a binary search. The site shows one movie already in the group. "The new one" means it belongs above that movie. "The one I already rated" means it belongs below. Each answer cuts the remaining movies about in half.

There is no "too tough to call." A tie would leave the slot unclear, and Elo needs one number. The rater picks a side. Back, during the conversation and before they submit, returns to the previous question. Start over, before they submit, throws the draft away. Neither is stored. The log stores only the final answers that fix the slot.

The most questions a rating can ask is `ceil(log2(k + 1))`, where `k` is how many movies are already in that enjoyment group. The first movie in a group asks nothing and scores the middle of the band. In the simulations, a rating asked about 2 to 3 questions on average, and never more than 5, across clubs of 30 to 60 movies.

While the movie is still open, a member may replace their draft. The later answer is the one that counts. The moment the movie closes, the draft is committed and cannot be replaced. There is no re-rank and no edit after close.

### What is not stored

Elo totals are not stored. They are replayed. The event list is append-only: join, leave, suggest, rate, didn't-watch, and an admin close. Replaying the same list rebuilds the same lists and the same Elo.

## How the numbers enter Elo

The league is still `movie_elo`: each member's latest closed movie plays the other members' current movies, judges are people who rated both, and points move from one member to the other. The two old scores (enjoyment and quality) are both set to this member's compiled score for that movie, so the blend is just that score.

The suggester's score is kept on their personal list and is not given to Elo for that movie. They still judge other people's movies. See the edge cases below.

The replay uses the lists as they stand now, not the numbers from the night each movie closed. Inserting a movie can move the scores of older movies in the same enjoyment group, so every close replays the whole history. The pool of Elo points still sums to 1500 times the number of members. Rewriting scores does not create or destroy points. It can change who is ahead.

`movie_elo` normally refuses a score below 1. The bottom of "not really" is 0.0, so this replay allows 0 through 10. Clamping that 0 up to 1 changed almost nothing in the simulations.

A movie with no score from anyone except the suggester does not enter the league. There is no honest rating to attach, and inventing one would create a fake judge. The suggester's previous movie keeps defending them.

## Do the old Elo ideas still apply?

**The judge rule, yes.** A judge is someone who rated both movies. "I didn't watch" leaves a person out. The suggester is left out of their own movie. One shared judge is enough for a match. Zero shared judges skips that match. It is not a draw.

**Bias cancellation, only partly.** In today's Elo, a harsh rater and a generous rater are compared by the gap between two movies, so a personal habit of scoring low cancels. The new enjoyment question is an absolute choice. A person who says "a lot" to everything produces gaps only inside 7 to 10. A person who uses all three groups can produce a gap of 7 or more for the same pair of films. Within one group, only the order remains, and that part still cancels a level bias. Across groups, it does not.

**Order, yes, and more than the score rewrite.** Elo was always path-dependent. Playing the same movies in a shuffled order, with the same watchers and the same suggesters, moved the final Elo by about 80 points on average (as much as 139 in one shuffle). Who finished above whom agreed with the original order only about half the time, and one shuffle almost reversed the nearby ranks (agreement 0.07). The one-movie-at-a-time rule is doing real work. It is not a cosmetic queue.

**Rewriting old scores, less than it looks.** Replaying history with the latest scores, instead of the scores from the night each movie closed, left the final boards 2 to 6 Elo points apart. The board's jump when a new movie closes was about 18 to 20 points either way. Almost all of that jump is the new match. The rewrite of older numbers is real on the personal list, and small on the shared board.

## What the simulations say

Details, tables, and the chart are in `results/RESULTS.md`. Clubs of 5 or 6 people, 30 to 60 movies, hidden tastes, 15% not watching, and comparison mistakes of 0%, 8%, or 10%.

- Personal lists recovered the hidden order well: perfect with careful answers in this draw, about 0.90 to 0.96 when some comparisons were flipped.
- The shared Elo board was only a fair guide to who suggested movies other people enjoyed. Agreement with that hidden target was often about the same as today's two-score system, sometimes a bit worse on a short season. This design is not, by itself, a more accurate picker ranking.
- Stretching each list onto 1 through 10, ignoring the enjoyment groups, was the worst mapping on the short seasons (agreement 0.20 and 0.40). It also makes the first two movies look like a blowout, 10 against 1.
- Using only the middle of the enjoyment group, and ignoring the slot inside it, was calmer and sometimes matched the full scores. The comparisons are what make the personal list. They are optional for Elo.
- Today's two 1–10 scores, written once and never rewritten, tracked picker quality about as well and sometimes better. The two boards often disagreed with each other (agreement as low as 0.00 in one draw). Replacing the current system changes the standings. It does not obviously improve them.

## Edge cases

**Should the suggester rate their own movie?** Yes on their personal list, no in the Elo match for that movie. They watched it, so it belongs in their taste. The judge rule still refuses to let that taste defend their own pick. The prototype does this. Elo rejects a suggester who appears in that week's ratings, so the adapter drops them rather than asking the library to change.

**Someone never responds.** That blocks the whole club, because the next movie cannot open. An admin close is required. It records "I didn't watch" for anyone still silent, then closes. The suggester cannot be closed out: they have to rate. A timeout can call the same close. The prototype has the admin close and not the clock.

**Late joiners.** They start at 1500. They have no scores on closed movies, so they do not judge the past. If a movie is open when they join, they must rate it or skip it before it can close.

**Members who leave.** They stop blocking new movies. Their old ratings stay in the log and in the league, so past weeks still replay. Removing them from the member list would make `movie_elo` reject those weeks.

**Editing after close.** Not allowed. A second rating after close is an illegal event. While the movie is open, a later draft replaces the earlier one. Simulations never edit a closed movie.

**The first few movies.** The first movie in an enjoyment group asks nothing and scores the middle (8.5, 5.5, or 2.0), not a 10. That avoids treating a lone film as a perfect one. The second movie is one comparison. A whole-list stretch to 1–10 makes those first two movies a huge Elo gap. Do not use that mapping.

**Fewer than two judges.** One person who saw both movies is enough. The match is noisy, which is the same as today. If nobody except the suggester watched, the movie stays on their taste list and does not enter Elo. Their previous pick keeps defending them.

**Compression and drift.** The group total stays 1500 per member. Scores can still swing: a new favorite in "a lot" pulls older favorites down from 10 toward 7. In the runs here, that rewrite moved the final Elo board by only a few points. The large swings come from match order, not from the rewrite. A last-place "not really" is 0.0, which needs the wider 0–10 scale.

**Migrating today's data.** The old comparison questions, Back presses, and edited-away Elo scores are gone. PR #11's log, once merged, has the same hole for history from before the log: Beli keeps the final bucket and position, not the answers, and Elo keeps the latest pair, not the edits. A migration can seed each taste list from a Beli order when one exists, otherwise from the old blended score, highest first, and mark every past movie closed. Then replay Elo once. The new board will not match the old one. Do not invent the missing questions.

## Recommendation

Use the three enjoyment groups, binary search, no ties, and freeze ratings at close. Let the suggester rate for themselves and leave them out of Elo for that movie. Feed Elo the Beli-band scores and recompute history at each close, so the personal number and the league number stay the same. Keep one movie open at a time, and add an admin close so silence cannot stall the club.

Do not expect the shared board to become a sharper ranking of pickers than today's two scores. The gain is one list per person, a short question flow, and a single story from taste to Elo.
