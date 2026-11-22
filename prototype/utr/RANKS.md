# Pick-quality ranks

A rank is a label on Elo. Everyone still starts at 1500, the league is still zero-sum, and the club average stays near 1500. The artwork comes later. How fast those labels move is a separate choice, written up in [VOLATILITY.md](VOLATILITY.md). The lines below did not need to move.

1500 is the middle of **Silver II**. Silver runs from 1400 to 1559, so a new member is in the middle of Silver, not Platinum or Emerald.

## Cutoffs

Divisions go IV, III, II, I. IV is the lowest. Iron through Gold are 40 points wide. Platinum is 20, so a good run can cross it. Emerald is 30. Diamond is 40. Master has no division.

You step up the moment you cross a line. You step down only after you are 10 points below the line you are holding, so one ordinary close does not give the rank back.

| Rank | Elo |
|---|---|
| Iron IV | below 1120 |
| Iron III | 1120 |
| Iron II | 1160 |
| Iron I | 1200 |
| Bronze IV | 1240 |
| Bronze III | 1280 |
| Bronze II | 1320 |
| Bronze I | 1360 |
| Silver IV | 1400 |
| Silver III | 1440 |
| Silver II | 1480 |
| Silver I | 1520 |
| Gold IV | 1560 |
| Gold III | 1600 |
| Gold II | 1640 |
| Gold I | 1680 |
| Platinum IV | 1720 |
| Platinum III | 1740 |
| Platinum II | 1760 |
| Platinum I | 1780 |
| Emerald IV | 1800 |
| Emerald III | 1830 |
| Emerald II | 1860 |
| Emerald I | 1890 |
| Diamond IV | 1920 |
| Diamond III | 1960 |
| Diamond II | 2000 |
| Diamond I | 2040 |
| Master | 2080 |

## Top chairs

These two are not scores. They are seats.

A rated pick is a movie they suggested that at least one other member scored. Six rated picks is the minimum: that is the sample on which a consistently good picker can reach Emerald once score gaps count a bit more. The details are in [VOLATILITY.md](VOLATILITY.md).

- **Challenger** is only the current #1, and only with Elo at least 1800 (Emerald) and at least 6 rated picks.
- **Grandmaster** is only the current #2, and only while someone is Challenger, with Elo at least 1720 (Platinum) and at least 6 rated picks.
- If the leader is not there yet, both chairs stay empty. Second place does not become Challenger.
- Anyone else, however high, keeps the absolute rank. Master is that absolute rank, from 2080 up. In these seasons nobody reached it.

## What the seasons did under the original step size

The tables in this section are the earlier run: K=32, d=2, and a 10-pick chair. They are not the recommendation. [VOLATILITY.md](VOLATILITY.md) is.

Six members, one movie at a time, full Elo rebuild at every close. Hidden movie quality follows who suggested it. About 12% of the others miss a movie, and 8% of comparison answers are flipped. Forty seasons of 100 movies. The mix is one consistently good picker, four typical pickers, and one weak picker. A second set of seasons puts two good pickers in the same club.

The numbers below are the median movie, counting from the first close. The full tables, including percentiles, are in [results/ranks.md](results/ranks.md).

### One good picker among typical ones

| | Good | Average | Bad |
|---|---:|---:|---:|
| Elo after 10 / 30 / 60 / 100 | 1631 / 1757 / 1851 / 1881 | 1494 / 1505 / 1496 / 1498 | 1394 / 1224 / 1165 / 1126 |
| Gold | 6 | 29 | never |
| Platinum | 19 | once in 160 careers | never |
| Emerald | 35 | never | never |
| Diamond | 85, and only 19 of 40 | never | never |
| Master | never in 100 movies | never | never |
| Challenger | 55, all 40 careers | never | never |
| Down to Bronze | never | 78 of 160, median movie 53 | 10 |
| Down to Iron | never | never | 28 |

A typical picker sits on 1500 the whole way, which is Silver II. Most of them touch Gold at some point (139 of 160). Almost none reach Platinum.

A good picker's first movie has nobody to play, so it does not move Elo. It then defends against the next suggestions. By movie 6 that one confirmed pick has carried them to about 1630, which is Gold. Platinum takes until about movie 19, and Emerald until about movie 35. That is the sustained run: a few of their own picks, not a single night. Diamond is uncommon inside 100 movies, and Master does not appear.

The Challenger chair waits until movie 55 even though the score is already Emerald, because the 10-pick minimum has not been met yet. In this club the #2 is a typical picker, still around Silver, so Grandmaster stays empty.

### Two good pickers

They split the wins, so each climbs more slowly. Mean Elo is about 1680 after 20 movies, 1736 after 40 (just into Platinum), and 1800 after 100 (the Emerald line). Challenger arrives at a median of movie 62 (30 of 40 careers). Grandmaster arrives at a median of movie 68 (28 of 40). Typical and weak pickers never hold either chair.

### How often the label changes

Share of closes where the displayed rank changed:

| Picker | Any change | The tier changed | On someone else's movie |
|---|---:|---:|---:|
| Good | 15% | 6% | 8% |
| Average | 19% | 5% | 11% |
| Bad | 14% | 3% | 6% |

For a typical picker the tier changes on about one close in twenty. The division changes on about one close in five, one step at a time. The 10-point cushion is what keeps a single ordinary night from undoing the last step.

## The club today

Shawshank is the only closed movie, and six people are in the club. The live score sheet is not in this repo. It does not matter for the board. The first movie has no earlier pick to play, so it is zero matches and every Elo stays 1500.

All six members are **Silver II**. The suggester has one rated pick, which is short of the six required for either top chair.

## Where the code is

`ranks.py` is the mapping. `rank_sim.py` writes `results/ranks.md` and `results/ranks.json`. `test_ranks.py` checks the boundaries, the chairs, and the 10-point cushion. Nothing here is wired into the live app.
