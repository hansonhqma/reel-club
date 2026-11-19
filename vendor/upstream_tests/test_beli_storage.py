import json
import tempfile
import unittest
from pathlib import Path

from movie_beli import (
    BELI_VERSION,
    FINE,
    LIKED,
    PREFER_OLD,
    Movie,
    Rankings,
    ValidationError,
    load_rankings,
    rankings_from_dict,
    rankings_to_dict,
    save_rankings,
)


def sample():
    r = Rankings(["Alex", "Bea", "Cy"])
    r.submit_movie("Heat", "Alex")
    r.submit_movie("Big", "Alex")
    r.submit_movie("Up", "Bea")
    r.rank_movie("Bea", "Heat", LIKED, lambda n, o: PREFER_OLD)
    r.rank_movie("Bea", "Big", LIKED, lambda n, o: PREFER_OLD)
    r.rank_movie("Cy", "Up", FINE, lambda n, o: PREFER_OLD)
    return r


class BeliStorageTests(unittest.TestCase):
    def test_dict_shape_and_round_trip(self):
        r = sample()
        data = rankings_to_dict(r)
        self.assertEqual(data["version"], BELI_VERSION)
        self.assertEqual(data["members"], ["Alex", "Bea", "Cy"])
        self.assertEqual(data["movies"][0], {"title": "Heat", "submitted_by": "Alex"})
        self.assertEqual(data["lists"]["Bea"], {"liked": ["Heat", "Big"], "fine": [], "disliked": []})
        again = rankings_from_dict(json.loads(json.dumps(data)))
        self.assertEqual(again.to_dict(), r.to_dict())
        self.assertEqual(again.member_list("Bea"), r.member_list("Bea"))
        self.assertEqual(again.leaderboard(), r.leaderboard())

    def test_file_round_trip_creates_parent_directory(self):
        r = sample()
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data" / "beli.json"
            save_rankings(path, r)
            self.assertEqual(load_rankings(path).to_dict(), r.to_dict())

    def test_bad_version_and_bad_lists_are_rejected(self):
        with self.assertRaises(ValidationError):
            rankings_from_dict({"version": 2, "members": []})
        base = {"version": BELI_VERSION, "members": ["A", "B"], "movies": [{"title": "M", "submitted_by": "A"}]}
        with self.assertRaises(ValidationError):
            rankings_from_dict(dict(base, lists={"A": {"liked": ["M"]}}))  # own submission
        with self.assertRaises(ValidationError):
            rankings_from_dict(dict(base, lists={"B": {"liked": ["M"], "fine": ["M"]}}))  # twice
        with self.assertRaises(ValidationError):
            rankings_from_dict(dict(base, lists={"B": {"great": ["M"]}}))  # unknown bucket
        with self.assertRaises(ValidationError):
            rankings_from_dict(dict(base, lists={"Nobody": {"liked": []}}))
        with self.assertRaises(ValidationError):
            Movie.from_dict({"title": "M"})

    def test_wrong_shapes_raise_validation_error_not_crash(self):
        for bad in (
            [],  # top-level list
            {"version": BELI_VERSION, "members": "AB"},  # string, not list
            {"version": BELI_VERSION, "members": [], "movies": {}},
            {"version": BELI_VERSION, "members": [], "movies": ["M"]},
            {"version": BELI_VERSION, "members": ["A"], "lists": []},
            {"version": BELI_VERSION, "members": ["A"], "lists": {"A": []}},
            {"version": BELI_VERSION, "members": ["A"], "lists": {"A": {"liked": "M"}}},
        ):
            with self.assertRaises(ValidationError, msg=repr(bad)):
                rankings_from_dict(bad)

    def test_save_replaces_atomically_and_leaves_no_temp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "beli.json"
            path.write_text("{garbage", encoding="utf-8")
            save_rankings(path, sample())
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()), ["beli.json"])
            self.assertEqual(load_rankings(path).members, ("Alex", "Bea", "Cy"))


if __name__ == "__main__":
    unittest.main()
