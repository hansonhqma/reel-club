"""Rank cutoffs. Run from the repo root:

    python -m unittest prototype.utr.test_ranks
"""

from __future__ import annotations

import unittest

from prototype.utr.ranks import (
    CHALLENGER_MIN_ELO,
    GRANDMASTER_MIN_ELO,
    LADDER,
    absolute_label,
    assign_ranks,
    cutoff_table,
    next_absolute,
)


class RankTests(unittest.TestCase):
    def test_divisions_meet_the_next_tier(self):
        for (name, floor, width), nxt in zip(LADDER, LADDER[1:]):
            if name == "Master":
                continue
            self.assertEqual(floor + 4 * width, nxt[1], name)

    def test_start_is_the_middle_of_silver_ii(self):
        self.assertEqual(absolute_label(1500), "Silver II")
        self.assertEqual(absolute_label(1480), "Silver II")
        self.assertEqual(absolute_label(1519.9), "Silver II")
        self.assertEqual(absolute_label(1479.9), "Silver III")
        self.assertEqual(absolute_label(1520), "Silver I")

    def test_tier_boundaries(self):
        self.assertEqual(absolute_label(1119.9), "Iron IV")
        self.assertEqual(absolute_label(1120), "Iron III")
        self.assertEqual(absolute_label(1239.9), "Iron I")
        self.assertEqual(absolute_label(1240), "Bronze IV")
        self.assertEqual(absolute_label(1399.9), "Bronze I")
        self.assertEqual(absolute_label(1400), "Silver IV")
        self.assertEqual(absolute_label(1719.9), "Gold I")
        self.assertEqual(absolute_label(1720), "Platinum IV")
        self.assertEqual(absolute_label(1799.9), "Platinum I")
        self.assertEqual(absolute_label(1800), "Emerald IV")
        self.assertEqual(absolute_label(1919.9), "Emerald I")
        self.assertEqual(absolute_label(1920), "Diamond IV")
        self.assertEqual(absolute_label(2079.9), "Diamond I")
        self.assertEqual(absolute_label(2080), "Master")

    def test_top_chairs_need_the_lead_and_a_track_record(self):
        elos = {"A": 1850, "B": 1760, "C": 1760}
        picks = {"A": 6, "B": 6, "C": 6}
        labels = assign_ranks(elos, picks)
        self.assertEqual(labels["A"], "Challenger")
        self.assertEqual(labels["B"], "Grandmaster")
        self.assertEqual(labels["C"], "Platinum II")

        early = assign_ranks(elos, {"A": 5, "B": 6, "C": 6})
        self.assertEqual(early["A"], "Emerald III")
        self.assertEqual(early["B"], "Platinum II")
        self.assertNotIn("Challenger", early.values())
        self.assertNotIn("Grandmaster", early.values())

        low = assign_ranks({"A": CHALLENGER_MIN_ELO - 1, "B": GRANDMASTER_MIN_ELO - 1}, {"A": 20, "B": 20})
        self.assertEqual(low["A"], "Platinum I")
        self.assertEqual(low["B"], "Gold I")

    def test_demotion_waits_ten_points(self):
        self.assertEqual(next_absolute("Silver II", 1470), "Silver II")
        self.assertEqual(next_absolute("Silver II", 1469), "Silver III")
        self.assertEqual(next_absolute("Silver II", 1520), "Silver I")
        self.assertEqual(next_absolute("Iron IV", 900), "Iron IV")
        labels = assign_ranks(
            {"A": 1850, "B": 1500},
            {"A": 6, "B": 0},
            {"A": "Emerald III", "B": "Silver II"},
        )
        self.assertEqual(labels["A"], "Challenger")
        self.assertEqual(labels["B"], "Silver II")

    def test_cutoff_table_starts_at_silver_for_1500(self):
        rows = dict(cutoff_table())
        self.assertEqual(rows["Silver II"], "1480")
        self.assertIn("rated picks", rows["Challenger"])
        self.assertIn("rated picks", rows["Grandmaster"])


if __name__ == "__main__":
    unittest.main()
