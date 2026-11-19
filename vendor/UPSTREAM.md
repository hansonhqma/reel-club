# Vendored ranking engine

`vendor/movie_elo` is an unmodified copy of [hansonhqma/elo-grouprating](https://github.com/hansonhqma/elo-grouprating) at commit `bef8ba41c5c1cf4c2946d826e4891c1e6a6b8aa7` (package `movie-night-elo` 1.0.0).

- The upstream README is preserved as `vendor/MOVIE_ELO_README.md`.
- The upstream unittest suite is in `vendor/upstream_tests` and runs as part of `npm test`.
- Do not edit the math. Reel Club talks to the package through `scripts/elo_bridge.py`, which calls `replay`, `preview_week`, `format_week_report`, and `format_standings`.
- `pyproject.toml` declares an MIT license. The upstream repository did not include a LICENSE file.

# Vendored Beli-style rankings

`vendor/movie_beli` is a copy of the `movie_beli` package from [hansonhqma/elo-grouprating](https://github.com/hansonhqma/elo-grouprating) at commit `d7c10e79ebde403f4f828835850d6c9bbabb42d7` (the merge of pull request #1 is `8db5dc167957bfa3f401f6205b884673a5474560`; the package files match). Its spec lives upstream at `docs/beli-rankings.md`.

This tree is not unmodified. Push access to elo-grouprating was not available, so Reel Club carries a local patch on top of that commit. `finish_ranking` raises `OwnSubmissionError` when the member submitted the movie, and `Insertion.from_dict` rejects coerced `candidates`, `lo`, `hi`, and `rerank` instead of turning them into a different search. Apply `vendor/movie_beli.upstream.patch` from the root of elo-grouprating to land the same change upstream.

- The upstream tests `test_beli_ranking.py` and `test_beli_storage.py` sit in `vendor/upstream_tests` and run as part of `npm test`. The Beli ranking test includes the local patch's cases.
- Reel Club talks to the package through `scripts/beli_bridge.py`, which calls `Rankings`, `Insertion`, `finish_ranking`, `member_list`, `movie_scores`, `community_score`, and `leaderboard`. `movie_beli.storage` (file persistence) is not used; SQLite holds the lists.
- `movie_beli` is independent of `movie_elo`; neither imports the other.
