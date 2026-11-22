# UTR prototype

A sketch of a single rating system: comparative taste lists, compiled into the existing Elo league. It does not change the live app.

- [DESIGN.md](DESIGN.md) is the spec, the edge cases, and the recommendation.
- [RANKS.md](RANKS.md) maps pick-quality Elo onto League-style ranks. [VOLATILITY.md](VOLATILITY.md) is the recommended step size, measured in a picker's own picks. [results/volatility.md](results/volatility.md) is that comparison.
- [results/RESULTS.md](results/RESULTS.md) is the rating simulation write-up. [results/stability.svg](results/stability.svg) is the chart.

From the repo root:

```bash
python3 -m unittest prototype.utr.test_utr prototype.utr.test_ranks prototype.utr.test_volatility
python3 prototype/utr/simulate.py
python3 prototype/utr/rank_sim.py
python3 prototype/utr/volatility.py
```

The simulation commands rewrite `results/`.
