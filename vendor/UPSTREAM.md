# Vendored ranking engine

`vendor/movie_elo` is an unmodified copy of [hansonhqma/elo-grouprating](https://github.com/hansonhqma/elo-grouprating) at commit `bef8ba41c5c1cf4c2946d826e4891c1e6a6b8aa7` (package `movie-night-elo` 1.0.0).

- The upstream README is preserved as `vendor/MOVIE_ELO_README.md`.
- The upstream unittest suite is in `vendor/upstream_tests` and runs as part of `npm test`.
- Do not edit the math. Reel Club talks to the package through `scripts/elo_bridge.py`, which calls `replay`, `preview_week`, `format_week_report`, and `format_standings`.
- `pyproject.toml` declares an MIT license. The upstream repository did not include a LICENSE file.

# Vendored Beli-style rankings

`vendor/movie_beli` is an unmodified copy of the `movie_beli` package from [hansonhqma/elo-grouprating](https://github.com/hansonhqma/elo-grouprating) branch `feature/beli-rankings` (pull request #1) at commit `d7c10e79ebde403f4f828835850d6c9bbabb42d7`. Its spec lives upstream at `docs/beli-rankings.md`.

- The upstream tests `test_beli_ranking.py` and `test_beli_storage.py` sit in `vendor/upstream_tests` and run as part of `npm test`.
- Do not edit the ranking logic. Reel Club talks to the package through `scripts/beli_bridge.py`, which calls `Rankings`, `Insertion`, `finish_ranking`, `member_list`, `movie_scores`, `community_score`, and `leaderboard`. `movie_beli.storage` (file persistence) is not used; SQLite holds the lists.
- `movie_beli` is independent of `movie_elo`; neither imports the other.
