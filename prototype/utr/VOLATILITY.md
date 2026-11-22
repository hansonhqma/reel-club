# How fast a rank should move

A rank is still just a label on Elo. The lines in [RANKS.md](RANKS.md) stay where they are: 1500 is the middle of Silver II, Platinum starts at 1720, Emerald and the Challenger score start at 1800. What changes is how hard a score gap pushes Elo, and how many of your own picks the top chairs wait for.

Progress is counted in **your own rated picks**, not in club-weeks, so the same rule fits a club of 4, 6, or 8. A rated pick is a movie you suggested that at least one other member scored. In a weekly club of 6, you pick about every 6 weeks, so 6 of your picks is about 30 movies. That calendar time is a side note. The target is the picks.

The full grid is in [results/volatility.md](results/volatility.md). Sixteen seasons of each club size, the same movies replayed under every setting. One picker is consistently good, one is weak, and the rest are typical.

## Recommendation

Use the **spicy** row.

- Score sensitivity `d = 1.25`. Today `d = 2`, so a 2-point gap on the 0–10 list is about a 91% win and a 1-point gap is about 76%. At 1.25, a 1.25-point gap is the 91% win and a 1-point gap is about 86%. Stretching the list scores by the same factor is this same lever, not a second one.
- Step size `K = 160 / (n − 1)`, which is `32 × 5 / (n − 1)`. A 6-person club stays at K=32. A 4-person club uses 53.3. An 8-person club uses 22.9. Each of your picks plays everyone else and then defends against everyone else, so a fixed K makes a big club climb much faster *per pick* than a small one. Scaling K keeps “six of my picks” meaning the same thing.
- Challenger and Grandmaster require **6 rated picks**, not 10. Challenger is still only the current #1 and still needs Elo 1800. Grandmaster is still only #2, and only while someone is Challenger, at Elo 1720.

Under that setting a good picker reaches Gold on their 1st rated pick, Platinum on their 4th, and Emerald and Challenger on their 6th, in clubs of 4, 6, and 8.

| Club size | Gold | Platinum | Emerald | Challenger | Elo when the 6th pick first lands |
|---:|---:|---:|---:|---:|---:|
| 4 | 1 | 4 | 6 | 6 | 1768 |
| 6 | 1 | 4 | 6 | 6 | 1788 |
| 8 | 1 | 4 | 6 | 6 | 1799 |

The Elo in the last column is the moment the 6th pick closes. The Challenger chair is the median pick on which they are actually #1 and at 1800, which can be a few movies later while that same pick is still defending. For every club size that median is the 6th pick.

## What the other rows do

| Setting | d | K | Picks required | Challenger, club of 4 / 6 / 8 |
|---|---:|---|---:|---|
| current | 2 | 32, same for every club | 10 | 10 (only 2 of 16 small clubs) / 10 / 10 |
| mild | 1.75 | 160/(n−1) | 6 | 8 / 6 / 6 |
| medium | 1.5 | 160/(n−1) | 6 | 7 / 6 / 6 |
| spicy, the recommendation | 1.25 | 160/(n−1) | 6 | 6 / 6 / 6 |

Mild and medium are the same idea turned down. In a 6- or 8-person club they also hit Challenger on the 6th pick. In a 4-person club they land on the 8th and the 7th. Spicy is the one that holds at 6 for all three sizes.

Leaving K at 32 and only sharpening `d` to 1.5 does **not** hold. In a 12-season check the 4-person good picker was still around 1700 after 6 picks and had not reached Challenger inside 8 picks, while the 6- and 8-person pickers had. That is why K scales with the club.

## Mistakes and flicker

A typical picker is wrongly high when the label is Platinum or above, and wrongly low when it is Bronze or below. A weak picker is wrongly high at Gold or above. A good picker is wrongly low when they are still Silver after 2 of their own picks. “Not first” is the share of seasons where the good picker is not in 1st place when their 6th pick lands.

Spicy, the recommendation:

| Club | Typical, too high | Typical, too low | Weak, at Gold or above | Good, still Silver after 2 picks | Good, not 1st at pick 6 | Typical label changes | Typical tier changes |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0% | 2% | 0% | 1% | 6% | 28% | 5% |
| 6 | 0% | 6% | 0% | 1% | 0% | 21% | 5% |
| 8 | 0% | 6% | 0% | 2% | 0% | 16% | 4% |

Current, for comparison: nobody typical is too high either. Too-low is 0% / 5% / 8%. Label changes are 16% / 18% / 19%, and tier changes are 2% / 4% / 5%.

So the recommendation does not start handing Platinum to ordinary pickers. A typical picker spends about one close in twenty below Silver, same neighborhood as today. Their tier changes on about one close in twenty. Their division changes on about one close in four or five. That is the extra movement. It is not a new tier every night.

A good picker's label changes more often in a small club (about 32% of closes when there are 4 members, 20% when there are 6), because each of their picks is a larger share of the matches.

## Two good pickers

The target above is one strong picker in an otherwise ordinary club. If two people both pick well, they split the points. On the recommended setting in a 6-person club, Challenger arrived at a median of 8 own picks and only 18 of 32 careers got there inside 10 picks. Grandmaster, the other one, was 15 of 32 at a median of 8. No typical picker took either chair.

## Levers that did not matter

- **Alpha** does nothing. Each list contributes one number, and that number is copied into both Elo inputs, so the blend is the number either way. Turning alpha from 0.5 to 0 reproduced the same ratings.
- **Judge weight W** (200 versus 800) changed a good picker's Elo at pick 6 by a few points. Too small to steer the climb while everyone is still near 1500.
- **A neutral 1500 opponent for the opening movie** added about 1 point by pick 6. One extra match is small next to the matches a pick already plays, and recentering spreads those points across the club.
- **A placement K**, double the normal step for each player's first 6 picks, still reached Challenger on pick 6, but a typical picker changed label on about 35% of closes and sat in Bronze or below on about 15% of them. In an 8-person club about 4% of a typical picker's closes were Platinum or above. That is the noisy version. It is not the recommendation.

The rank cutoffs did not need to move. Sharpening the score gap, scaling K with the club, and dropping the chair from 10 picks to 6 was enough. Widening Silver to hide the small Bronze tail would also make a weak picker look ordinary for longer.
