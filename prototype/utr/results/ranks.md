# Rank ladder simulation

These seasons use the original step size, K=32 and d=2, and were scored when the top chairs required 10 rated picks. The recommended faster setting is in [../VOLATILITY.md](../VOLATILITY.md).

Six members, one movie at a time. Elo is the UTR rebuild and still starts at 1500.
The main club is one consistently good picker, four typical pickers, and one weak picker.
A second club has two good pickers, so the #2 chair can actually be earned.
About 12% of the others miss a movie, and 8% of comparison answers are flipped.
40 seasons of 100 movies for the main club. 20 seasons for the two-good club.

## Cutoffs

1500 is the middle of Silver II. Cuts below Master are absolute. The top two chairs are relative.
A member steps up as soon as they cross a line, and steps down only after they are 10 points below the line they are holding.

| Rank | Requirement |
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
| Grandmaster | current #2, and only while #1 is Challenger; Elo at least 1720, and 10 rated picks |
| Challenger | current #1, Elo at least 1800, and 10 rated picks |

Challenger is only the current #1, and only at Elo 1800 or higher with at least 10 rated picks.
Grandmaster is only the current #2, and only while someone is Challenger, at Elo 1720 or higher with at least 10 rated picks.
A rated pick is a movie they suggested that at least one other member scored. Ten picks is about 60 movies when six people take turns. If the leader is not there yet, both chairs stay empty. Second place does not inherit Challenger.

## Elo after this many movies

Mean, then the 10th / 50th / 90th percentile.

| Movies | Good | Average | Bad |
|---:|---|---|---|
| 10 | 1631 (1598 / 1634 / 1652) | 1494 (1433 / 1490 / 1562) | 1394 (1376 / 1386 / 1418) |
| 20 | 1725 (1690 / 1733 / 1752) | 1497 (1420 / 1501 / 1572) | 1287 (1260 / 1277 / 1331) |
| 30 | 1757 (1699 / 1776 / 1801) | 1505 (1416 / 1506 / 1592) | 1224 (1188 / 1221 / 1269) |
| 40 | 1801 (1753 / 1807 / 1851) | 1499 (1414 / 1494 / 1589) | 1201 (1158 / 1200 / 1252) |
| 60 | 1851 (1802 / 1855 / 1895) | 1496 (1414 / 1496 / 1584) | 1165 (1109 / 1163 / 1222) |
| 100 | 1881 (1834 / 1888 / 1929) | 1498 (1418 / 1496 / 1583) | 1126 (1074 / 1122 / 1191) |

## Movies until a picker first reaches a tier

Median close, from the start of the club, using the absolute cut. A count in parentheses means fewer than half of those careers ever got there. A dash means none did. Reaching Challenger does not count as reaching Master.

| Tier | Good | Average | Bad |
|---|---:|---:|---:|
| Gold IV | 6 | 29 | – |
| Platinum IV | 19 | 71 (1/160) | – |
| Emerald IV | 35 | – | – |
| Diamond IV | 85 (19/40) | – | – |
| Master | – | – | – |

Median close until a picker is first at that tier or lower:

| Tier | Good | Average | Bad |
|---|---:|---:|---:|
| Bronze I | – | 53 (78/160) | 10 |
| Iron I | – | – | 28 |

Share of careers that ever touched the tier:

- Gold IV: good 40/40, average 139/160, bad 0/40
- Platinum IV: good 40/40, average 1/160, bad 0/40
- Emerald IV: good 40/40, average 0/160, bad 0/40
- Diamond IV: good 19/40, average 0/160, bad 0/40
- Master: good 0/40, average 0/160, bad 0/40

Top chairs in the main club. Median movie, among careers that reached the chair:

- good Grandmaster: 0/40, never
- good Challenger: 40/40, median movie 55
- average Grandmaster: 0/160, never
- average Challenger: 0/160, never
- bad Grandmaster: 0/40, never
- bad Challenger: 0/40, never

## How often the label changes

Share of closes where the displayed rank changed. "On someone else's movie" is a change on a close they did not suggest.

| Picker | Any change | Tier change | On someone else's movie |
|---|---:|---:|---:|
| Good | 15% | 6% | 8% |
| Average | 19% | 5% | 11% |
| Bad | 14% | 3% | 6% |

## Where the main club is sitting

- After 10 movies: Silver II 49, Silver III 43, Silver I 36, Silver IV 30, Bronze I 25, Gold III 23, Gold IV 19, Gold II 15
- After 30 movies: Silver II 39, Silver I 36, Gold IV 23, Silver III 23, Iron I 19, Silver IV 15, Platinum I 15, Bronze IV 11
- After 60 movies: Silver II 38, Challenger 36, Silver I 35, Silver III 30, Silver IV 22, Gold IV 14, Iron II 12, Iron III 11
- After 100 movies: Challenger 39, Silver III 39, Silver I 33, Silver II 31, Gold IV 25, Iron IV 18, Silver IV 13, Iron III 10

## Two good pickers

Same ladder. The good pickers split the wins, so each climbs a bit slower, and second place can be Grandmaster.

| Chair | Good careers that reached it | Median movie |
|---|---:|---:|
| Grandmaster | 28/40 | 68 |
| Challenger | 30/40 | 62 |

Average and bad pickers holding a top chair in that club:
- average Grandmaster: 0/60
- average Challenger: 0/60
- bad Grandmaster: 0/20
- bad Challenger: 0/20

Good pickers' Elo in the two-good club (mean): 20 movies 1680, 40 movies 1736, 60 movies 1769, 100 movies 1800.

## Shawshank, the only closed movie

Six members, one movie, everyone rated it. The live score sheet is not in this repo. It does not matter for the board: the first movie has no earlier pick to play.
Matches played: 0. Every Elo is 1500.
Displayed ranks: Five Silver II, Four Silver II, One Silver II, Six Silver II, Three Silver II, Two Silver II.
The suggester has 1 rated pick, which is under the minimum for either top chair.
