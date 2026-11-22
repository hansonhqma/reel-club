# UTR simulation results

Synthetic clubs. Each person has a hidden enjoyment for every movie.
They answer the enjoyment question from that number, then answer the
comparisons with occasional mistakes (`flip` is the chance a comparison is backwards).
About 15% of non-suggesters do not watch a given movie.
Closed ratings are never edited.

## Questions and recovery of taste

| Club | Movies | Mistakes | Questions, average | 95th percentile | Max | Share with no comparison | Taste agreement |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5 people, careful answers | 30 | 0% | 2.21 | 4 | 4 | 12% | 1.00 |
| 5 people, 10% mistakes | 30 | 10% | 2.14 | 4 | 4 | 12% | 0.90 |
| 6 people, 40 movies | 40 | 8% | 2.41 | 4 | 5 | 9% | 0.96 |
| 5 people, 60 movies | 60 | 8% | 3.02 | 5 | 5 | 6% | 0.95 |

Taste agreement is 1 when a person's list is in the same order as their hidden enjoyment, and 0 when the list is no better than chance. With no deliberate mistakes the lists matched exactly in this draw. A bucket boundary can still swap two movies whose enjoyment is almost the same; that simply did not happen here.

## Does the Elo board track who picks well?

The hidden target is the average enjoyment other people had for the movies that person suggested.
Agreement is between that target and the final Elo order.

| Club | Beli bands | Clamped at 1 | Bucket middle only | Whole-list 1–10 | Today's two scores |
|---|---:|---:|---:|---:|---:|
| 5 people, careful answers | 0.40 | 0.40 | 0.60 | 0.20 | 0.80 |
| 5 people, 10% mistakes | 0.80 | 0.80 | 0.60 | 0.40 | 0.80 |
| 6 people, 40 movies | 0.47 | 0.47 | 0.47 | 0.47 | 0.47 |
| 5 people, 60 movies | 1.00 | 1.00 | 0.80 | 1.00 | 1.00 |

Spread of Elo around 1500 (standard deviation), same clubs:

| Club | Beli bands | Bucket middle only | Whole-list 1–10 | Today's two scores |
|---|---:|---:|---:|---:|
| 5 people, careful answers | 66.0 | 56.9 | 65.7 | 70.7 |
| 5 people, 10% mistakes | 70.3 | 56.9 | 68.3 | 70.7 |
| 6 people, 40 movies | 84.2 | 80.3 | 82.6 | 88.7 |
| 5 people, 60 movies | 93.5 | 91.7 | 90.7 | 84.1 |

## How far the board moves when a movie closes

Each close rebuilds Elo from the scores the personal lists show at that moment.
The jump is the root-mean-square change in Elo across members.

| Club | Typical jump per movie |
|---|---:|
| 5 people, careful answers | 18.1 |
| 5 people, 10% mistakes | 18.9 |
| 6 people, 40 movies | 19.1 |
| 5 people, 60 movies | 19.5 |

That jump is the new match, using the lists as they stand. Personal scores and the numbers fed to Elo are the same numbers.

## Order

Same hidden tastes, same suggesters, movies played in a shuffled order.

| Comparison | Agreement of final Elo with the original order | Typical Elo distance | Largest Elo distance |
|---|---:|---:|---:|
| 30 movies, 12 shuffles, 8% mistakes | 0.47 (lowest 0.07) | 80.8 | 138.6 |

Agreement of 1 would mean the shuffle never changed who finished above whom.

## Reading the picture

`stability.svg` is the 6-person, 40-movie club with 8% mistaken comparisons.
A higher point means the board moved more when that movie closed.
