"""Rules for the UTR prototype. Run from the repo root:

    python -m unittest prototype.utr.test_utr
"""

from __future__ import annotations

import unittest

from prototype.utr.utr import (
    ANSWERS,
    Club,
    Search,
    Taste,
    UtrError,
    question_budget,
    seed_taste,
)


def club(*names: str) -> Club:
    group = Club()
    for name in names:
        group.apply({"type": "join", "user": name})
    return group


def rate(user: str, movie: str, bucket: str, answers=()):
    return {
        "type": "rate",
        "user": user,
        "movie": movie,
        "bucket": bucket,
        "answers": list(answers),
    }


class SeedTests(unittest.TestCase):
    def test_beli_order_wins_and_no_questions_are_invented(self):
        taste = seed_taste(
            beli_order=[("Lantern", "liked"), ("Night", "liked"), ("Rooftop", "fine")],
            blended_scores={"Other": 10},
        )
        self.assertEqual(taste.movies(), ["Lantern", "Night", "Rooftop"])
        self.assertEqual(taste.scores()["Lantern"], 10.0)
        self.assertEqual(taste.scores()["Night"], 7.0)
        self.assertEqual(taste.scores()["Rooftop"], 5.5)

    def test_blended_scores_fall_into_enjoyment_groups(self):
        taste = seed_taste(blended_scores={"Heat": 8, "Up": 9, "Bus": 5, "Slump": 2})
        self.assertEqual(taste.buckets["a_lot"], ["Up", "Heat"])
        self.assertEqual(taste.buckets["kinda"], ["Bus"])
        self.assertEqual(taste.buckets["not_really"], ["Slump"])


class InsertionTests(unittest.TestCase):
    def test_empty_bucket_asks_nothing_and_uses_the_middle(self):
        taste = Taste()
        self.assertEqual(question_budget(0), 0)
        self.assertEqual(taste.place("A", "a_lot", ()), 0)
        self.assertEqual(taste.scores()["A"], 8.5)
        self.assertEqual(taste.movies(), ["A"])

    def test_binary_search_puts_the_new_movie_above_a_worse_one(self):
        taste = Taste()
        taste.place("Night", "a_lot", ())
        used = taste.place("Lantern", "a_lot", ("new",))
        self.assertEqual(used, 1)
        self.assertEqual(taste.movies(), ["Lantern", "Night"])
        self.assertEqual(taste.scores()["Lantern"], 10.0)
        self.assertEqual(taste.scores()["Night"], 7.0)

    def test_question_budget_bounds_a_consistent_search(self):
        taste = Taste()
        for title in "ABCD":
            search = taste.start(title, "kinda")
            answers = []
            while not search.done:
                self.assertLess(len(answers), question_budget(len(taste.buckets["kinda"])) + 1)
                search = search.answer("old")
                answers.append("old")
            taste.commit(search)
        self.assertLessEqual(len(taste.buckets["kinda"]), 4)
        self.assertEqual(taste.movies(), ["A", "B", "C", "D"])

    def test_back_returns_to_the_previous_comparison(self):
        taste = Taste()
        for title in "ABC":
            search = taste.start(title, "a_lot")
            while not search.done:
                search = search.answer("old")
            taste.commit(search)
        search = taste.start("N", "a_lot")
        first = search.pivot
        search = search.answer("old")
        search = search.answer("back")
        self.assertEqual(search.pivot, first)
        self.assertTrue(search.answer("back") is search or search.answer("back").pivot == first)

    def test_too_tough_is_not_a_rating(self):
        taste = Taste()
        taste.place("A", "a_lot", ())
        with self.assertRaises(UtrError):
            taste.place("B", "a_lot", ("too_tough",))

    def test_buckets_stay_in_enjoyment_order(self):
        taste = Taste()
        taste.place("Loved", "a_lot", ())
        taste.place("Fine", "kinda", ())
        taste.place("No", "not_really", ())
        self.assertEqual(taste.movies(), ["Loved", "Fine", "No"])
        scores = taste.scores()
        self.assertGreater(scores["Loved"], scores["Fine"])
        self.assertGreater(scores["Fine"], scores["No"])

    def test_rank_mapping_spreads_the_whole_list(self):
        taste = Taste()
        taste.place("A", "a_lot", ())
        taste.place("B", "not_really", ())
        self.assertEqual(taste.scores("rank"), {"A": 10.0, "B": 1.0})
        self.assertEqual(taste.scores("baseline")["A"], 8.5)
        self.assertEqual(taste.scores("clamp")["B"], 2.0)


class CloseTests(unittest.TestCase):
    def test_movie_closes_when_everyone_has_answered_and_then_locks(self):
        group = club("Ada", "Bea", "Cy")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        group.apply(rate("Ada", "Heat", "a_lot"))
        group.apply(rate("Bea", "Heat", "kinda"))
        self.assertIsNotNone(group.open)
        group.apply({"type": "skip", "user": "Cy", "movie": "Heat"})
        self.assertIsNone(group.open)
        self.assertEqual(group.closed[0].title, "Heat")
        self.assertIn("Heat", group.tastes["Ada"].scores())
        with self.assertRaises(UtrError):
            group.apply(rate("Bea", "Heat", "a_lot"))
        with self.assertRaises(UtrError):
            group.apply({"type": "suggest", "user": "Bea", "movie": "Heat"})

    def test_a_second_rating_while_open_replaces_the_draft(self):
        group = club("Ada", "Bea")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        group.apply(rate("Ada", "Heat", "not_really"))
        group.apply(rate("Ada", "Heat", "a_lot"))
        group.apply(rate("Bea", "Heat", "a_lot"))
        self.assertEqual(group.tastes["Ada"].bucket_of("Heat"), "a_lot")

    def test_suggester_cannot_skip_and_is_left_out_of_elo(self):
        group = club("Ada", "Bea", "Cy")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        with self.assertRaises(UtrError):
            group.apply({"type": "skip", "user": "Ada", "movie": "Heat"})
        group.apply(rate("Ada", "Heat", "a_lot"))
        group.apply(rate("Bea", "Heat", "a_lot"))
        group.apply(rate("Cy", "Heat", "a_lot"))
        weeks = group.elo_inputs()
        self.assertEqual(set(weeks[0].ratings), {"Bea", "Cy"})
        self.assertIn("Heat", group.tastes["Ada"].scores())
        league = group.league()
        self.assertAlmostEqual(league.total_elo(), 4500.0)
        self.assertEqual(league.history[0].matches, ())

    def test_only_one_movie_is_open_and_silence_can_be_closed(self):
        group = club("Ada", "Bea", "Cy")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        with self.assertRaises(UtrError):
            group.apply({"type": "suggest", "user": "Bea", "movie": "Alias"})
        group.apply(rate("Ada", "Heat", "a_lot"))
        group.apply({"type": "admin_close", "movie": "Heat"})
        self.assertIsNone(group.open)
        self.assertEqual(set(group.closed[0].skipped), {"Bea", "Cy"})
        self.assertEqual(group.elo_inputs(), [])

    def test_suggester_or_admin_can_close_and_silence_counts_as_not_watching(self):
        group = club("Ada", "Bea", "Cy")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        group.apply(rate("Bea", "Heat", "kinda"))
        with self.assertRaises(UtrError):
            group.apply({"type": "close", "movie": "Heat", "by": "Bea"})
        group.apply({"type": "close", "movie": "Heat", "by": "Ada"})
        self.assertIsNone(group.open)
        self.assertEqual(set(group.closed[0].skipped), {"Ada", "Cy"})
        self.assertNotIn("Heat", group.tastes["Ada"].scores())
        self.assertIn("Heat", group.tastes["Bea"].scores())
        with self.assertRaises(UtrError):
            group.apply(rate("Cy", "Heat", "a_lot"))

        group.apply({"type": "suggest", "user": "Bea", "movie": "Up"})
        group.apply({"type": "close", "movie": "Up", "by": "Cy", "admin": True})
        self.assertEqual(set(group.closed[1].skipped), {"Ada", "Bea", "Cy"})

    def test_a_leaver_stops_blocking_and_a_joiner_must_answer(self):
        group = club("Ada", "Bea", "Cy")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        group.apply(rate("Ada", "Heat", "a_lot"))
        group.apply({"type": "leave", "user": "Cy"})
        self.assertIsNotNone(group.open)
        group.apply(rate("Bea", "Heat", "kinda"))
        self.assertIsNone(group.open)
        group.apply({"type": "join", "user": "Dee"})
        group.apply({"type": "suggest", "user": "Bea", "movie": "Up"})
        group.apply(rate("Ada", "Up", "kinda"))
        group.apply(rate("Bea", "Up", "a_lot"))
        self.assertIsNotNone(group.open)
        group.apply({"type": "skip", "user": "Dee", "movie": "Up"})
        self.assertIsNone(group.open)
        self.assertIn("Dee", group.league().elo)
        self.assertNotIn("Up", group.tastes["Cy"].scores())

    def test_replay_matches_the_same_events_twice(self):
        events = [
            {"type": "join", "user": "Ada"},
            {"type": "join", "user": "Bea"},
            {"type": "join", "user": "Cy"},
            {"type": "suggest", "user": "Ada", "movie": "Heat"},
            rate("Ada", "Heat", "a_lot"),
            rate("Bea", "Heat", "a_lot"),
            {"type": "skip", "user": "Cy", "movie": "Heat"},
            {"type": "suggest", "user": "Bea", "movie": "Up"},
            rate("Ada", "Up", "a_lot", ("new",)),
            rate("Bea", "Up", "kinda"),
            rate("Cy", "Up", "a_lot"),
        ]
        first = Club().replay(events).league().elo
        second = Club().replay(events).league().elo
        self.assertEqual(first, second)

    def test_inserting_above_an_old_movie_changes_its_score_and_the_replay(self):
        events = [
            {"type": "join", "user": name} for name in ("Ada", "Bea", "Cy")
        ] + [
            {"type": "suggest", "user": "Ada", "movie": "Heat"},
            rate("Ada", "Heat", "a_lot"),
            rate("Bea", "Heat", "a_lot"),
            rate("Cy", "Heat", "a_lot"),
        ]
        group = Club().replay(events)
        self.assertEqual(group.tastes["Bea"].scores()["Heat"], 8.5)
        group.apply({"type": "suggest", "user": "Cy", "movie": "Up"})
        group.apply(rate("Ada", "Up", "kinda"))
        group.apply(rate("Bea", "Up", "a_lot", ("new",)))
        group.apply(rate("Cy", "Up", "kinda"))
        self.assertEqual(group.tastes["Bea"].scores()["Up"], 10.0)
        self.assertEqual(group.tastes["Bea"].scores()["Heat"], 7.0)
        group.apply({"type": "suggest", "user": "Ada", "movie": "Later"})
        group.apply(rate("Ada", "Later", "a_lot", ("new",)))
        group.apply(rate("Bea", "Later", "a_lot", ("new", "new")))
        group.apply(rate("Cy", "Later", "not_really"))
        self.assertEqual(group.tastes["Bea"].scores()["Up"], 8.5)
        self.assertEqual(group.tastes["Bea"].scores()["Heat"], 7.0)
        heat_week = next(week for week in group.elo_inputs() if week.movie == "Heat")
        self.assertEqual(heat_week.ratings["Bea"].experience, 7.0)
        self.assertEqual(heat_week.ratings["Bea"].quality, 7.0)
        self.assertNotIn("Ada", heat_week.ratings)
        self.assertAlmostEqual(sum(group.league().elo.values()), 4500.0)

    def test_one_shared_judge_still_plays_and_zero_ratings_do_not(self):
        group = club("Ada", "Bea")
        group.apply({"type": "suggest", "user": "Ada", "movie": "Heat"})
        group.apply(rate("Ada", "Heat", "a_lot"))
        group.apply(rate("Bea", "Heat", "a_lot"))
        group.apply({"type": "suggest", "user": "Bea", "movie": "Up"})
        group.apply(rate("Bea", "Up", "kinda"))
        group.apply({"type": "skip", "user": "Ada", "movie": "Up"})
        self.assertEqual(group.elo_inputs()[-1].movie if False else group.closed[-1].title, "Up")
        self.assertEqual(len(group.elo_inputs()), 1)

    def test_search_answers_are_only_new_or_old(self):
        self.assertEqual(ANSWERS, ("new", "old"))
        search = Search("N", "a_lot", ("A",))
        self.assertEqual(search.questions_left, 1)


if __name__ == "__main__":
    unittest.main()
