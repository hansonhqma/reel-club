# Elo levers for a faster climb

Progress is counted in a picker's own rated picks, not in club-weeks.
A rated pick is a movie they suggested that at least one other member scored.
Each cell is the median across 16 seasons. A count in parentheses means fewer than half of those careers got there.
Clubs of 4, 6, and 8 take turns one movie at a time. One picker is consistently good, one is weak, and the rest are typical.
The same seasons are replayed under every setting.

Alpha does nothing here: a list contributes one score, and that score is copied into both Elo inputs, so the blend is the score either way.
Making score gaps count more is the `d` parameter. A smaller `d` is the same lever as stretching the 0–10 differences.
The opening-movie baseline gives the first played movie one extra match against a neutral 5.5 pick at 1500, then removes that phantom and recenters. It is off unless a setting says otherwise.

## Settings

| Setting | K | d | Provisional | Baseline | Challenger minimum |
|---|---:|---:|---|---|---:|
| current | 32 | 2 | – | off | 10 |
| mild | 32 × 5/(n−1) | 1.75 | – | off | 6 |
| medium | 32 × 5/(n−1) | 1.5 | – | off | 6 |
| spicy | 32 × 5/(n−1) | 1.25 | – | off | 6 |

Challenger is still only the current #1, and only at Elo 1800 or higher once the minimum picks are in.
Grandmaster is only #2, and only while someone is Challenger, at Elo 1720 or higher with the same pick minimum.
Where K is scaled, a 4-person club uses K 53.3, a 6-person club uses K 32, and an 8-person club uses K 22.9.
Rank lines are unchanged: Gold 1560, Platinum 1720, Emerald 1800. 1500 stays the middle of Silver II.

## current

| Club | Good to Gold | Good to Plat | Good to Emerald | Good to Challenger | Elo at own pick 6 |
|---:|---:|---:|---:|---:|---:|
| 4 | 2 | 6 | 10 (2/16) | 10 (2/16) | 1698 |
| 6 | 1 | 4 | 6 | 10 | 1770 |
| 8 | 1 | 3 | 5 | 10 | 1819 |

| Club | Average outside Silver/Gold, high | Average outside, low | Bad at Gold or above | Good still Silver after 2 picks | Good not #1 at pick 6 | Label flip, avg | Tier flip, avg |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0% | 0% | 0% | 3% | 6% | 16% | 2% |
| 6 | 0% | 5% | 0% | 1% | 0% | 18% | 4% |
| 8 | 0% | 8% | 0% | 1% | 0% | 19% | 5% |

Good picker's own label-flip rate: 4 members 23%, 6 members 24%, 8 members 19%.

## mild

| Club | Good to Gold | Good to Plat | Good to Emerald | Good to Challenger | Elo at own pick 6 |
|---:|---:|---:|---:|---:|---:|
| 4 | 1 | 4 | 8 | 8 | 1757 |
| 6 | 1 | 4 | 6 | 6 | 1776 |
| 8 | 1 | 4 | 6 | 6 | 1786 |

| Club | Average outside Silver/Gold, high | Average outside, low | Bad at Gold or above | Good still Silver after 2 picks | Good not #1 at pick 6 | Label flip, avg | Tier flip, avg |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0% | 2% | 0% | 1% | 6% | 25% | 5% |
| 6 | 0% | 5% | 0% | 1% | 0% | 19% | 5% |
| 8 | 0% | 4% | 0% | 2% | 0% | 15% | 4% |

Good picker's own label-flip rate: 4 members 34%, 6 members 21%, 8 members 14%.

## medium

| Club | Good to Gold | Good to Plat | Good to Emerald | Good to Challenger | Elo at own pick 6 |
|---:|---:|---:|---:|---:|---:|
| 4 | 1 | 4 | 7 | 7 | 1763 |
| 6 | 1 | 4 | 6 | 6 | 1783 |
| 8 | 1 | 4 | 6 | 6 | 1793 |

| Club | Average outside Silver/Gold, high | Average outside, low | Bad at Gold or above | Good still Silver after 2 picks | Good not #1 at pick 6 | Label flip, avg | Tier flip, avg |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0% | 2% | 0% | 1% | 6% | 26% | 5% |
| 6 | 0% | 5% | 0% | 1% | 0% | 19% | 5% |
| 8 | 0% | 5% | 0% | 2% | 0% | 16% | 4% |

Good picker's own label-flip rate: 4 members 33%, 6 members 20%, 8 members 14%.

## spicy

| Club | Good to Gold | Good to Plat | Good to Emerald | Good to Challenger | Elo at own pick 6 |
|---:|---:|---:|---:|---:|---:|
| 4 | 1 | 4 | 6 | 6 | 1768 |
| 6 | 1 | 4 | 6 | 6 | 1788 |
| 8 | 1 | 4 | 6 | 6 | 1799 |

| Club | Average outside Silver/Gold, high | Average outside, low | Bad at Gold or above | Good still Silver after 2 picks | Good not #1 at pick 6 | Label flip, avg | Tier flip, avg |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0% | 2% | 0% | 1% | 6% | 28% | 5% |
| 6 | 0% | 6% | 0% | 1% | 0% | 21% | 5% |
| 8 | 0% | 6% | 0% | 2% | 0% | 16% | 4% |

Good picker's own label-flip rate: 4 members 32%, 6 members 20%, 8 members 14%.

## Two good pickers, medium setting, 6 members

A second strong picker can be Grandmaster. The minimum is the same 6 rated picks.

- Challenger: 8 own picks, 18/32 careers.
- Grandmaster: 8 (15/32) own picks, 15/32 careers.
- Average pickers who reached Grandmaster: 0/48.
- Average pickers who reached Challenger: 0/48.
