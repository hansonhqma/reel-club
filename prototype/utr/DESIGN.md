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
6. The movie closes when every active member has answered. The suggester, or an admin, can also close it early. Anyone who has not rated is recorded as "I didn't watch." There is no timer.
7. Every taste list is turned into a number for every movie that person has rated, using the list as it stands now. The whole Elo history is replayed from scratch with those numbers.

Someone who has left does not have to answer, and does not block the close. Someone who joins while a movie is open does have to answer it, unless the movie is closed early.

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

Elo totals are not stored. They are replayed. The event list is append-only: join, leave, suggest, rate, didn't-watch, and a close by the suggester or an admin. Replaying the same list rebuilds the same lists and the same Elo.

## How the numbers enter Elo

The league is still `movie_elo`: each member's latest closed movie plays the other members' current movies, judges are people who rated both, and points move from one member to the other. The two old scores (enjoyment and quality) are both set to this member's compiled score for that movie, so the blend is just that score.

The suggester's score is kept on their personal list and is not given to Elo for that movie. They still judge other people's movies. See the edge cases below.

Every close rebuilds Elo from scratch. Each closed movie is fed the score that member's list gives it right now, not the number it had on the night it closed. A later favorite can move an older movie down the personal list, and that new number is what the old match uses too. The personal score and the league input are the same number. The pool of Elo points still sums to 1500 times the number of members.

`movie_elo` normally refuses a score below 1. The bottom of "not really" is 0.0, so this replay allows 0 through 10. Clamping that 0 up to 1 changed almost nothing in the simulations.

A movie with no score from anyone except the suggester does not enter the league. There is no honest rating to attach, and inventing one would create a fake judge. The suggester's previous movie keeps defending them.

## Do the old Elo ideas still apply?

**The judge rule, yes.** A judge is someone who rated both movies. "I didn't watch" leaves a person out. The suggester is left out of their own movie. One shared judge is enough for a match. Zero shared judges skips that match. It is not a draw.

**Bias cancellation, only partly.** In today's Elo, a harsh rater and a generous rater are compared by the gap between two movies, so a personal habit of scoring low cancels. The new enjoyment question is an absolute choice. A person who says "a lot" to everything produces gaps only inside 7 to 10. A person who uses all three groups can produce a gap of 7 or more for the same pair of films. Within one group, only the order remains, and that part still cancels a level bias. Across groups, it does not.

**Order, yes.** Elo was always path-dependent. Playing the same movies in a shuffled order, with the same watchers and the same suggesters, moved the final Elo by about 80 points on average (as much as 139 in one shuffle). Who finished above whom agreed with the original order only about half the time, and one shuffle almost reversed the nearby ranks (agreement 0.07). The one-movie-at-a-time rule is doing real work. It is not a cosmetic queue.

**Rebuilding history is the rule.** When movie *t* closes, Elo is rebuilt from every closed movie using the scores the lists show at that moment. A member's change at that close is their Elo after this rebuild minus their Elo after the rebuild at the previous close.

That change has two parts, and they add up:

- **The new movie.** Replay the earlier movies with the lists as they stand now, then see what the new movie's matches add on top.
- **Older ratings being re-sorted.** That same replay of the earlier movies, compared with the board from the previous close. This is the part that exists only because inserting the new movie moved older scores.

The site can say "−17 from the new movie, −15 from older ratings being re-sorted." That pair is the biggest re-sort for one person in the 6-person, 40-movie run, not a typical night. Across the club, the new movie is about 17 to 19 Elo points of the movement. The re-sort is about 1.5 to 2 points. A stored write-up of an old match would go stale, so show the rebuilt one.

## What the simulations say

Details, tables, and the chart are in `results/RESULTS.md`. Clubs of 5 or 6 people, 30 to 60 movies, hidden tastes, 15% not watching, and comparison mistakes of 0%, 8%, or 10%.

- Personal lists recovered the hidden order well: perfect with careful answers in this draw, about 0.90 to 0.96 when some comparisons were flipped.
- The shared Elo board was only a fair guide to who suggested movies other people enjoyed. Agreement with that hidden target was often about the same as today's two-score system, sometimes a bit worse on a short season. This design is not, by itself, a more accurate picker ranking.
- Stretching each list onto 1 through 10, ignoring the enjoyment groups, was the worst mapping on the short seasons (agreement 0.20 and 0.40). It also makes the first two movies look like a blowout, 10 against 1.
- Using only the middle of the enjoyment group, and ignoring the slot inside it, was calmer and sometimes matched the full scores. The comparisons are what make the personal list. They are optional for Elo.
- Today's two 1–10 scores, written once and never rewritten, tracked picker quality about as well and sometimes better. The two boards often disagreed with each other (agreement as low as 0.00 in one draw). Replacing the current system changes the standings. It does not obviously improve them.

## Edge cases

**Should the suggester rate their own movie?** Yes on their personal list, no in the Elo match for that movie. They watched it, so it belongs in their taste. The judge rule still refuses to let that taste defend their own pick. The prototype does this. Elo rejects a suggester who appears in that week's ratings, so the adapter drops them rather than asking the library to change.

**Someone never responds.** The suggester or an admin can close the movie. Everyone who has not rated, including a silent suggester, is recorded as "I didn't watch." There is no automatic timeout. A member who is not the suggester and not an admin cannot close it. Until someone does, the next movie cannot open.

**Late joiners.** They start at 1500. They have no scores on closed movies, so they do not judge the past. If a movie is open when they join, they must rate it or skip it before it can close.

**Members who leave.** They stop blocking new movies. Their old ratings stay in the log and in the league, so past weeks still replay. Removing them from the member list would make `movie_elo` reject those weeks.

**Editing after close.** Not allowed. A second rating after close is an illegal event. While the movie is open, a later draft replaces the earlier one. Simulations never edit a closed movie.

**The first few movies.** The first movie in an enjoyment group asks nothing and scores the middle (8.5, 5.5, or 2.0), not a 10. That avoids treating a lone film as a perfect one. The second movie is one comparison. A whole-list stretch to 1–10 makes those first two movies a huge Elo gap. Do not use that mapping.

**Fewer than two judges.** One person who saw both movies is enough. The match is noisy, which is the same as today. If nobody except the suggester watched, the movie stays on their taste list and does not enter Elo. Their previous pick keeps defending them.

**Compression.** The group total stays 1500 per member. A new favorite in "a lot" pulls older favorites down from 10 toward 7, and the rebuilt league uses those new numbers. The large swings in the simulations come from which movie is played when, not from the total of points drifting. A last-place "not really" is 0.0, which needs the wider 0–10 scale.

**Migrating today's data.** Do not invent comparison questions. Seed each list from that member's Beli order when one exists: same groups, same best-to-worst order, dropped straight into the new list. Otherwise sort their old blended scores and place each movie by the 7 and 4 cuts (7 and up is "a lot", 4 up to 7 is "kinda", below 4 is "not really"). Mark those movies closed. Then replay Elo once from the seeded lists. The new board will not match the old one. Back presses, abandoned searches, and Elo edits that were overwritten are already gone.

## Recommendation

Use the three enjoyment groups, binary search, no ties, and freeze ratings at close. Let the suggester rate for themselves and leave them out of Elo for that movie. Feed Elo the Beli-band scores and rebuild history at each close from the lists as they stand. The suggester or an admin can close a movie early; silence counts as "I didn't watch," and there is no timer. Keep one movie open at a time.

Do not expect the shared board to become a sharper ranking of pickers than today's two scores. The gain is one list per person, a short question flow, and a single story from taste to Elo.

## Ranks

A rank is a label on the Elo, not a change to it. 1500, the starting rating, is the middle of Silver II. The cuts, the top-chair rules, and the season results are in [RANKS.md](RANKS.md).
