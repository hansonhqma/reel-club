# UTR prototype

A sketch of a single rating system: comparative taste lists, compiled into the existing Elo league. It does not change the live app.

- [DESIGN.md](DESIGN.md) is the spec, the edge cases, and the recommendation.
- [RANKS.md](RANKS.md) maps pick-quality Elo onto League-style ranks. [results/ranks.md](results/ranks.md) is that simulation.
- [results/RESULTS.md](results/RESULTS.md) is the rating simulation write-up. [results/stability.svg](results/stability.svg) is the chart.

From the repo root:

```bash
python3 -m unittest prototype.utr.test_utr prototype.utr.test_ranks
python3 prototype/utr/simulate.py
python3 prototype/utr/rank_sim.py
```

The last two commands rewrite `results/`.
