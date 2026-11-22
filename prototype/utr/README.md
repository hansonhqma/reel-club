# UTR prototype

A sketch of a single rating system: comparative taste lists, compiled into the existing Elo league. It does not change the live app.

- [DESIGN.md](DESIGN.md) is the spec, the edge cases, and the recommendation.
- [results/RESULTS.md](results/RESULTS.md) is the simulation write-up. [results/stability.svg](results/stability.svg) is the chart.

From the repo root:

```bash
python3 -m unittest prototype.utr.test_utr
python3 prototype/utr/simulate.py
```

The second command rewrites `results/`.
