"""Vendored movie_elo must match the engine Reel Club runs today.

The fixtures are the standings and per-close history from this repo's
``vendor/movie_elo``. Set ``MOVIE_ELO_PARITY_ROOT`` to another checkout of the
same package (the copy that was installed before this tree was the only copy)
and the test also requires that checkout to produce the same JSON.

    PYTHONPATH=vendor python3 -m unittest tests.test_movie_elo_parity
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

from movie_elo import Params, Week, replay

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "movie_elo_parity.json"

MEMBERS6 = ["Avery", "Blair", "Casey", "Drew", "Ellis", "Frankie"]


def _week(week_id, suggester, movie, ratings):
    return {
        "week_id": week_id,
        "suggester": suggester,
        "movie": movie,
        "ratings": {name: {"experience": score, "quality": score} for name, score in ratings.items()},
    }


# Same parameters the app passes: d=1.25 and K=160/(n-1), scale 0-10.
SCENARIOS = {
    "defaults_two_closes": {
        "members": ["Ada", "Bea", "Cy"],
        "params": None,
        "weeks": [
            {
                "week_id": "2026-01-02",
                "suggester": "Ada",
                "movie": "Opening",
                "date": "2026-01-02",
                "ratings": {
                    "Bea": {"experience": 8, "quality": 6},
                    "Cy": {"experience": 7, "quality": 7},
                },
            },
            {
                "week_id": "2026-01-09",
                "suggester": "Bea",
                "movie": "Follow-up",
                "ratings": {
                    "Ada": {"experience": 9, "quality": 8},
                    "Cy": {"experience": 4, "quality": 5},
                },
            },
        ],
    },
    "utr_six_rebuild": {
        "members": MEMBERS6,
        "params": {"k": 160 / 5, "d": 1.25, "scale_min": 0, "scale_max": 10},
        "weeks": [
            _week("1", "Avery", "Shawshank", {
                "Blair": 9.2, "Casey": 8.5, "Drew": 8.8, "Ellis": 7.6, "Frankie": 9.0,
            }),
            _week("2", "Blair", "Heat", {
                "Avery": 6.4, "Casey": 5.5, "Drew": 7.1, "Ellis": 4.8, "Frankie": 6.0,
            }),
            _week("3", "Casey", "Parasite", {
                "Avery": 9.6, "Blair": 8.1, "Drew": 9.0, "Ellis": 8.4, "Frankie": 3.2,
            }),
            _week("4", "Drew", "Spirited Away", {
                "Avery": 7.8, "Blair": 8.6, "Casey": 9.4, "Ellis": 6.9, "Frankie": 5.1,
            }),
            _week("5", "Ellis", "The Third Man", {
                "Avery": 5.2, "Blair": 6.8, "Casey": 7.4, "Drew": 8.0, "Frankie": 4.1,
            }),
            _week("6", "Frankie", "In the Mood for Love", {
                "Avery": 8.3, "Blair": 3.9, "Casey": 6.2, "Drew": 7.7, "Ellis": 9.1,
            }),
        ],
    },
    "utr_four_roster": {
        "members": ["Ada", "Bea", "Cy", "Dee"],
        "params": {"k": 160 / 3, "d": 1.25, "scale_min": 0, "scale_max": 10},
        "weeks": [
            _week("1", "Ada", "Opening", {"Bea": 8.5, "Cy": 7.0, "Dee": 9.1}),
            _week("2", "Bea", "Second", {"Ada": 4.2, "Cy": 6.6, "Dee": 5.5}),
            _week("3", "Cy", "Third", {"Ada": 9.0, "Bea": 8.2, "Dee": 3.4}),
            _week("4", "Dee", "Fourth", {"Ada": 6.1, "Bea": 7.5, "Cy": 8.8}),
        ],
    },
    "utr_eight_roster": {
        "members": ["A", "B", "C", "D", "E", "F", "G", "H"],
        "params": {"k": 160 / 7, "d": 1.25, "scale_min": 0, "scale_max": 10},
        "weeks": [
            _week("1", "A", "One", {"B": 8.0, "C": 7.5, "D": 9.0, "E": 6.5, "F": 8.8, "G": 7.2, "H": 5.4}),
            _week("2", "B", "Two", {"A": 4.0, "C": 5.5, "D": 6.1, "E": 8.4, "F": 3.3, "G": 7.7, "H": 9.2}),
            _week("3", "H", "Three", {"A": 9.5, "B": 8.1, "C": 2.0, "D": 7.0, "E": 6.6, "F": 8.9, "G": 4.4}),
            _week("4", "D", "Four", {"A": 5.8, "B": 6.4, "C": 8.2, "E": 7.1, "F": 4.9, "G": 9.3, "H": 6.0}),
        ],
    },
}


def play(scenario):
    """Full rebuild after every close, which is how a UTR close feeds Elo."""
    members = scenario["members"]
    params = Params.from_dict(scenario["params"]) if scenario["params"] else Params()
    weeks = [Week.from_dict(week) for week in scenario["weeks"]]
    closes = []
    for end in range(1, len(weeks) + 1):
        league = replay(members, weeks[:end], params)
        closes.append(
            {
                "elo": league.elo,
                "total_elo": league.total_elo(),
                "standings": [row.to_dict() for row in league.standings()],
                "history": [result.to_dict() for result in league.history],
            }
        )
    return closes


def digest():
    return {name: play(scenario) for name, scenario in SCENARIOS.items()}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


class ParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.actual = digest()
        cls.expected = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_fixtures_match_vendored_replay(self):
        self.assertEqual(canonical(self.actual), canonical(self.expected))

    def test_first_close_does_not_move_elo(self):
        first = self.actual["utr_six_rebuild"][0]
        self.assertTrue(all(value == 1500 for value in first["elo"].values()))
        self.assertEqual(first["history"][0]["matches"], [])
        self.assertEqual(first["total_elo"], 9000)

    def test_later_closes_use_the_app_step_size(self):
        third = self.actual["utr_six_rebuild"][2]["history"][-1]
        self.assertTrue(third["matches"])
        self.assertTrue(all(match["k"] == 32 for match in third["matches"]))
        small = self.actual["utr_four_roster"][1]["history"][-1]
        self.assertTrue(all(abs(match["k"] - (160 / 3)) < 1e-12 for match in small["matches"]))
        large = self.actual["utr_eight_roster"][1]["history"][-1]
        self.assertTrue(all(abs(match["k"] - (160 / 7)) < 1e-12 for match in large["matches"]))

    def test_reference_checkout_matches_when_present(self):
        root = os.environ.get("MOVIE_ELO_PARITY_ROOT")
        if not root:
            self.skipTest("MOVIE_ELO_PARITY_ROOT is not set")
        env = os.environ.copy()
        env["PYTHONPATH"] = root
        env.pop("MOVIE_ELO_PARITY_ROOT", None)
        completed = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--emit"],
            text=True,
            capture_output=True,
            check=False,
            env=env,
            cwd=ROOT,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        reference = json.loads(completed.stdout)
        self.assertEqual(canonical(reference), canonical(self.actual))


if __name__ == "__main__":
    if "--emit" in sys.argv:
        json.dump(digest(), sys.stdout)
        sys.stdout.write("\n")
    else:
        unittest.main()
