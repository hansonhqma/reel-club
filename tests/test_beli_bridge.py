"""The Beli JSON bridge must return the same placements and numbers as movie_beli directly."""

import json
import subprocess
import sys
import unittest
from pathlib import Path

from movie_beli import Insertion, Rankings

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "scripts" / "beli_bridge.py"


def run_bridge(payload):
    completed = subprocess.run(
        [sys.executable, str(BRIDGE)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
        cwd=ROOT,
    )
    assert completed.stdout, completed.stderr
    return json.loads(completed.stdout)


def state():
    return {
        "members": ["Ada", "Bea", "Cy"],
        "movies": [
            {"title": "Heat", "submitted_by": "Ada"},
            {"title": "Alien", "submitted_by": "Ada"},
            {"title": "Se7en", "submitted_by": "Ada"},
            {"title": "Paddington 2", "submitted_by": "Bea"},
        ],
        "lists": {
            "Bea": {"liked": ["Alien", "Heat"], "fine": [], "disliked": []},
            "Cy": {"liked": ["Paddington 2"], "fine": ["Heat"], "disliked": []},
        },
    }


class BeliBridgeTests(unittest.TestCase):
    def test_view_matches_the_library(self):
        output = run_bridge({"command": "view", "state": state(), "member": "Cy"})
        self.assertTrue(output["ok"])
        rankings = Rankings.from_dict(state())
        self.assertEqual(output["my_list"], [row.to_dict() for row in rankings.member_list("Cy")])
        self.assertEqual(output["rankable"], [m.to_dict() for m in rankings.rankable("Cy")])
        self.assertEqual(output["leaderboard"], [row.to_dict() for row in rankings.leaderboard()])
        heat = next(m for m in output["movies"] if m["title"] == "Heat")
        self.assertEqual(heat["community_score"], rankings.community_score("Heat"))
        self.assertEqual(
            heat["scores"],
            [{"member": m, "bucket": b, "score": s} for m, b, s in rankings.movie_scores("Heat")],
        )

    def test_start_step_finish_round_trip(self):
        started = run_bridge(
            {"command": "start", "state": state(), "member": "Bea", "title": "Se7en", "bucket": "liked", "rerank": False}
        )
        self.assertTrue(started["ok"])
        self.assertFalse(started["done"])
        expected = Rankings.from_dict(state()).start_ranking("Bea", "Se7en", "liked")
        self.assertEqual(started["insertion"], expected.to_dict())
        self.assertEqual(started["pivot"], expected.pivot)
        self.assertEqual(started["questions_left"], expected.questions_left)

        # Se7en above Heat, below Alien.
        self.assertEqual(started["pivot"], "Heat")
        step = run_bridge({"command": "step", "state": state(), "insertion": started["insertion"], "answer": "new"})
        self.assertFalse(step["done"])
        self.assertEqual(step["pivot"], "Alien")
        peek = run_bridge({"command": "step", "state": state(), "insertion": step["insertion"], "answer": None})
        self.assertEqual(peek, step)
        done = run_bridge({"command": "step", "state": state(), "insertion": step["insertion"], "answer": "old"})
        self.assertTrue(done["done"])
        self.assertEqual(done["index"], 1)
        self.assertEqual(done["lists"], {"liked": ["Alien", "Se7en", "Heat"], "fine": [], "disliked": []})

        rankings = Rankings.from_dict(state())
        library = rankings.start_ranking("Bea", "Se7en", "liked").answer("new").answer("old")
        self.assertEqual(rankings.finish_ranking(library), 1)
        self.assertEqual(rankings.to_dict()["lists"]["Bea"], done["lists"])

    def test_empty_bucket_places_without_questions_and_rerank_swaps(self):
        placed = run_bridge(
            {"command": "start", "state": state(), "member": "Cy", "title": "Alien", "bucket": "disliked", "rerank": False}
        )
        self.assertTrue(placed["done"])
        self.assertEqual(placed["lists"]["disliked"], ["Alien"])

        rerank = run_bridge(
            {"command": "start", "state": state(), "member": "Cy", "title": "Heat", "bucket": "liked", "rerank": True}
        )
        self.assertFalse(rerank["done"])
        self.assertEqual(rerank["pivot"], "Paddington 2")
        done = run_bridge({"command": "step", "state": state(), "insertion": rerank["insertion"], "answer": "too_tough"})
        self.assertTrue(done["done"])
        self.assertEqual(done["lists"], {"liked": ["Paddington 2", "Heat"], "fine": [], "disliked": []})

    def test_remove_and_library_errors(self):
        removed = run_bridge({"command": "remove", "state": state(), "member": "Bea", "title": "Alien"})
        self.assertEqual(removed["lists"], {"liked": ["Heat"], "fine": [], "disliked": []})

        own = run_bridge(
            {"command": "start", "state": state(), "member": "Ada", "title": "Heat", "bucket": "liked", "rerank": False}
        )
        self.assertFalse(own["ok"])
        self.assertEqual(own["type"], "OwnSubmissionError")

        stale = dict(state())
        insertion = Insertion("Bea", "Se7en", "liked", ("Heat",), lo=1, hi=1).to_dict()
        stale_result = run_bridge({"command": "step", "state": stale, "insertion": insertion, "answer": None})
        self.assertFalse(stale_result["ok"])
        self.assertIn("list changed", stale_result["error"])
        self.assertEqual(stale_result["type"], "ValidationError")

        unknown = run_bridge({"command": "nope", "state": state()})
        self.assertFalse(unknown["ok"])
        self.assertIn("unknown command", unknown["error"])
        self.assertEqual(run_bridge([])["type"], "ValidationError")
        self.assertEqual(run_bridge("not an object")["type"], "ValidationError")
        self.assertEqual(run_bridge({"command": "view", "state": "nope", "member": "Ada"})["type"], "ValidationError")
        self.assertEqual(run_bridge({"command": "view", "state": state(), "member": 7})["type"], "ValidationError")
        broken = subprocess.run(
            [sys.executable, str(BRIDGE)], input="{not json", text=True, capture_output=True, check=False, cwd=ROOT
        )
        self.assertEqual(broken.returncode, 0)
        self.assertEqual(json.loads(broken.stdout)["type"], "JSONDecodeError")


if __name__ == "__main__":
    unittest.main()
