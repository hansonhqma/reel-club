# Ranking code in this repo

Reel Club does not install or clone a second repository to rank movies. `vendor/movie_elo` and `vendor/movie_beli` are the packages the bridges import. `npm test` runs their tests from `vendor/upstream_tests`. The Docker image copies this tree and does not fetch either package.

## movie_elo

`vendor/movie_elo` is the whole `movie-night-elo` 1.0.0 package, copied from commit `bef8ba41c5c1cf4c2946d826e4891c1e6a6b8aa7`. The package metadata declares an MIT license. That commit did not include a LICENSE file or a copyright notice.

The guide that shipped with the package is `vendor/MOVIE_ELO_README.md`. Reel Club calls it through `scripts/elo_bridge.py` (`replay`, `preview_week`, `format_week_report`, `format_standings`). The match math is not reimplemented in TypeScript. The app passes `d` and `K` in; the package defaults stay `d=2` and `K=32` when a caller does not.

## movie_beli

`vendor/movie_beli` is the whole Beli-style ranking package from commit `d7c10e79ebde403f4f828835850d6c9bbabb42d7` (the same files as merge `8db5dc167957bfa3f401f6205b884673a5474560`), plus a local correction already applied in `ranking.py`. `finish_ranking` raises `OwnSubmissionError` when the member submitted the movie, and `Insertion.from_dict` rejects coerced `candidates`, `lo`, `hi`, and `rerank` instead of turning them into a different search. `vendor/movie_beli.upstream.patch` is that diff. The spec that shipped with the package is not in this repo; the behavior Reel Club relies on is the code and `vendor/upstream_tests/test_beli_ranking.py`.

Reel Club calls it through `scripts/beli_bridge.py`. `movie_beli.storage` is not used; SQLite holds the lists. `movie_beli` does not import `movie_elo`.
