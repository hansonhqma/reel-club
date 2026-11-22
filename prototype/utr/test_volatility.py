"""The volatility replay matches the prototype league. Run from the repo root:

    python -m unittest prototype.utr.test_volatility
"""

from __future__ import annotations

import unittest

from prototype.utr.rank_sim import play
from prototype.utr.volatility import check_matches_default, roster, run_league, sized_spec


class VolatilityTests(unittest.TestCase):
    def test_replay_matches_the_club_league(self):
        names, roles = roster(4)
        group = play(names, roles, 8, seed=3)
        check_matches_default(group)

    def test_six_person_club_keeps_todays_k(self):
        spec = {"k": 32, "d": 1.25, "scale": True, "k_provisional": 64}
        self.assertAlmostEqual(sized_spec(spec, 6)["k"], 32)
        self.assertAlmostEqual(sized_spec(spec, 4)["k"], 32 * 5 / 3)
        self.assertAlmostEqual(sized_spec(spec, 8)["k"], 32 * 5 / 7)
        self.assertAlmostEqual(sized_spec(spec, 4)["k_provisional"], 64 * 5 / 3)

    def test_opening_baseline_stays_zero_sum(self):
        from prototype.utr.volatility import params_of, weeks_from

        names, roles = roster(4)
        group = play(names, roles, 6, seed=5)
        scores = group.closed[-1].scores
        weeks = weeks_from(group.closed, len(group.closed), scores)
        spec = {"k": 32, "d": 1.25, "w": 400}
        elo, _picks = run_league(names, weeks, params_of(spec), "opening")
        self.assertAlmostEqual(sum(elo.values()) / len(elo), 1500, places=6)


if __name__ == "__main__":
    unittest.main()
