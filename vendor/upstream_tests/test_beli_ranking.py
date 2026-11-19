import json
import unittest

from movie_beli import (
    BACK,
    DISLIKED,
    FINE,
    LIKED,
    PREFER_NEW,
    PREFER_OLD,
    TOO_TOUGH,
    Insertion,
    OwnSubmissionError,
    Rankings,
    ValidationError,
    score,
)


def scripted(*answers):
    """An ``ask`` callable that replays ``answers`` and records the pivots it saw."""
    queue = list(answers)
    seen = []

    def ask(new, old):
        seen.append(old)
        return queue.pop(0)

    ask.seen = seen
    return ask


def club(*titles, submitter="Sub", ranker="Ria"):
    r = Rankings([submitter, ranker])
    for t in titles:
        r.submit_movie(t, submitter)
    return r


class ScoreTests(unittest.TestCase):
    def test_worked_numbers_by_bucket_size(self):
        self.assertEqual([score(LIKED, 0, 1)], [8.5])
        self.assertEqual([score(LIKED, p, 2) for p in range(2)], [10.0, 7.0])
        self.assertEqual([score(LIKED, p, 5) for p in range(5)], [10.0, 9.3, 8.5, 7.8, 7.0])
        self.assertEqual(
            [score(LIKED, p, 10) for p in range(10)],
            [10.0, 9.7, 9.3, 9.0, 8.7, 8.3, 8.0, 7.7, 7.3, 7.0],
        )

    def test_other_buckets_and_rounding_half_up(self):
        self.assertEqual([score(FINE, p, 3) for p in range(3)], [6.9, 5.5, 4.0])  # raw 5.45 -> 5.5
        self.assertEqual(score(FINE, 0, 1), 5.5)
        self.assertEqual([score(DISLIKED, p, 2) for p in range(2)], [3.9, 0.0])
        self.assertEqual(score(DISLIKED, 0, 1), 2.0)
        with self.assertRaises(ValidationError):
            score(LIKED, 2, 2)
        with self.assertRaises(ValidationError):
            score("meh", 0, 1)

    def test_mixed_list_of_ten(self):
        r = club(*"ABCDEFGHIJ")
        for t in "ABCDEF":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        for t in "GHI":
            r.rank_movie("Ria", t, FINE, lambda n, o: PREFER_OLD)
        r.rank_movie("Ria", "J", DISLIKED, lambda n, o: PREFER_OLD)
        rows = r.member_list("Ria")
        self.assertEqual([x.rank for x in rows], list(range(1, 11)))
        self.assertEqual("".join(x.movie for x in rows), "ABCDEFGHIJ")
        self.assertEqual([x.score for x in rows], [10.0, 9.4, 8.8, 8.2, 7.6, 7.0, 6.9, 5.5, 4.0, 2.0])


class InsertionTests(unittest.TestCase):
    def test_empty_bucket_asks_nothing_and_scores_baseline(self):
        r = club("X")
        ask = scripted()
        self.assertEqual(r.rank_movie("Ria", "X", LIKED, ask), 0)
        self.assertEqual(ask.seen, [])
        self.assertEqual(r.score_of("Ria", "X"), 8.5)

    def test_prefer_new_goes_above(self):
        r = club("A", "B")
        r.rank_movie("Ria", "A", LIKED, scripted())
        ask = scripted(PREFER_NEW)
        r.rank_movie("Ria", "B", LIKED, ask)
        self.assertEqual(ask.seen, ["A"])
        self.assertEqual(r.bucket_list("Ria", LIKED), ("B", "A"))
        self.assertEqual([x.score for x in r.member_list("Ria")], [10.0, 7.0])

    def test_binary_search_order_and_question_bound(self):
        r = club(*"ABCDEFG", "New")
        for t in "ABCDEFG":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        # New belongs between E and F: pivots D (old), F (new), E (old).
        ask = scripted(PREFER_OLD, PREFER_NEW, PREFER_OLD)
        self.assertEqual(r.rank_movie("Ria", "New", LIKED, ask), 5)
        self.assertEqual(ask.seen, ["D", "F", "E"])
        self.assertEqual(r.bucket_list("Ria", LIKED), tuple("ABCDE") + ("New", "F", "G"))

    def test_too_tough_lands_just_below_the_pivot(self):
        r = club(*"ABCDE", "F")
        for t in "ABCDE":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        ask = scripted(TOO_TOUGH)
        self.assertEqual(r.rank_movie("Ria", "F", LIKED, ask), 3)
        self.assertEqual(ask.seen, ["C"])
        self.assertEqual(r.bucket_list("Ria", LIKED), ("A", "B", "C", "F", "D", "E"))

    def test_back_reasks_the_previous_pivot(self):
        r = club(*"ABC", "N")
        for t in "ABC":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        ask = scripted(BACK, PREFER_OLD, BACK, PREFER_NEW, PREFER_NEW)
        r.rank_movie("Ria", "N", LIKED, ask)
        # BACK with no history re-asks B; OLD moves to C; BACK returns to B; NEW, then A, NEW.
        self.assertEqual(ask.seen, ["B", "B", "C", "B", "A"])
        self.assertEqual(r.bucket_list("Ria", LIKED), ("N", "A", "B", "C"))

    def test_buckets_never_mix(self):
        r = club("A", "B")
        r.rank_movie("Ria", "A", LIKED, scripted())
        ask = scripted()
        r.rank_movie("Ria", "B", FINE, ask)
        self.assertEqual(ask.seen, [])
        self.assertEqual([(x.movie, x.score) for x in r.member_list("Ria")], [("A", 8.5), ("B", 5.5)])

    def test_resumable_state_rejects_a_changed_list(self):
        r = club("A", "B", "C")
        r.rank_movie("Ria", "A", LIKED, scripted())
        state = r.start_ranking("Ria", "B", LIKED).answer(PREFER_NEW)
        r.rank_movie("Ria", "C", LIKED, scripted(PREFER_NEW))
        with self.assertRaises(ValidationError):
            r.finish_ranking(state)
        with self.assertRaises(ValidationError):
            r.finish_ranking(r.start_ranking("Ria", "B", LIKED))  # not done

    def test_insertion_round_trips_through_json_between_steps(self):
        r = club("A", "B", "C", "D")
        for t in ("A", "B", "C"):
            r.rank_movie("Ria", t, LIKED, scripted(PREFER_OLD, PREFER_OLD))  # A, B, C
        state = r.start_ranking("Ria", "D", LIKED)
        while not state.done:  # a host stores the dict between requests and rebuilds the state
            stored = json.loads(json.dumps(state.to_dict()))
            state = Insertion.from_dict(stored)
            state = state.answer(PREFER_NEW if state.pivot == "C" else PREFER_OLD)
        self.assertEqual(Insertion.from_dict(state.to_dict()), state)
        self.assertEqual(r.finish_ranking(Insertion.from_dict(state.to_dict())), 2)
        self.assertEqual([x.movie for x in r.member_list("Ria")], ["A", "B", "D", "C"])
        self.assertEqual(r.member_list("Ria")[0].to_dict(), {"rank": 1, "movie": "A", "bucket": LIKED, "score": 10.0})
        self.assertEqual(r.leaderboard()[0].to_dict(), {"member": "Sub", "value": 8.5, "submitted": 4, "ranked": 4})

    def test_insertion_from_dict_rejects_bad_state(self):
        good = club("A").start_ranking("Ria", "A", LIKED).to_dict()
        for bad in (
            "nope",
            {**good, "bucket": "meh"},
            {**good, "lo": 5},
            {**good, "history": [[0, 9]]},
            {k: v for k, v in good.items() if k != "movie"},
            {**good, "candidates": None},
        ):
            with self.assertRaises(ValidationError):
                Insertion.from_dict(bad)


class RerankRemoveTests(unittest.TestCase):
    def test_remove_closes_the_gap_and_rescales(self):
        r = club("A", "B", "C")
        for t in "ABC":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        r.remove("Ria", "B")
        self.assertEqual(r.bucket_list("Ria", LIKED), ("A", "C"))
        self.assertEqual([x.score for x in r.member_list("Ria")], [10.0, 7.0])
        r.remove("Ria", "C")
        self.assertEqual(r.score_of("Ria", "A"), 8.5)
        with self.assertRaises(ValidationError):
            r.remove("Ria", "C")

    def test_rerank_moves_between_buckets_without_self_comparison(self):
        r = club("A", "B", "C")
        for t in "ABC":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        ask = scripted(PREFER_NEW, PREFER_NEW)
        r.rerank("Ria", "C", LIKED, ask)
        self.assertEqual(ask.seen, ["B", "A"])  # C itself is never a pivot
        self.assertEqual(r.bucket_list("Ria", LIKED), ("C", "A", "B"))
        r.rerank("Ria", "C", DISLIKED, scripted())
        self.assertEqual(r.bucket_list("Ria", LIKED), ("A", "B"))
        self.assertEqual(r.bucket_of("Ria", "C"), DISLIKED)
        with self.assertRaises(ValidationError):
            r.rank_movie("Ria", "C", LIKED, scripted())  # already ranked

    def test_rerank_is_atomic_on_bad_input_or_abandonment(self):
        r = club("A", "B")
        for t in "AB":
            r.rank_movie("Ria", t, LIKED, lambda n, o: PREFER_OLD)
        before = r.to_dict()
        with self.assertRaises(ValidationError):
            r.rerank("Ria", "B", "meh", scripted())  # bad bucket
        with self.assertRaises(ValidationError):
            r.rerank("Ria", "Nope", LIKED, scripted())  # unknown movie
        with self.assertRaises(ValidationError):
            r.start_rerank("Sub", "A", LIKED)  # not ranked by Sub
        state = r.start_rerank("Ria", "B", LIKED).answer(PREFER_NEW)  # started, never finished
        self.assertEqual(r.to_dict(), before)
        self.assertEqual(r.bucket_list("Ria", LIKED), ("A", "B"))
        r.finish_ranking(state)  # finishing swaps the placement in one step
        self.assertEqual(r.bucket_list("Ria", LIKED), ("B", "A"))
        r.remove("Ria", "B")
        with self.assertRaises(ValidationError):
            r.finish_ranking(state)  # the movie is no longer ranked; nothing is inserted
        self.assertEqual(r.bucket_list("Ria", LIKED), ("A",))


class RulesTests(unittest.TestCase):
    def test_own_submission_is_rejected(self):
        r = club("Mine")
        with self.assertRaises(OwnSubmissionError):
            r.rank_movie("Sub", "Mine", LIKED, scripted())
        self.assertEqual(r.rankable("Sub"), ())
        self.assertEqual([m.title for m in r.rankable("Ria")], ["Mine"])

    def test_members_and_movies_are_validated(self):
        r = Rankings(["A"])
        with self.assertRaises(ValidationError):
            r.add_member("A")
        with self.assertRaises(ValidationError):
            r.add_member("  ")
        with self.assertRaises(ValidationError):
            r.submit_movie("X", "Nobody")
        r.submit_movie("  X ", "A")
        with self.assertRaises(ValidationError):
            r.submit_movie("X", "A")
        with self.assertRaises(ValidationError):
            r.submit_movie("", "A")
        with self.assertRaises(ValidationError):
            r.start_ranking("A", "Missing", LIKED)
        with self.assertRaises(ValidationError):
            r.community_score("Missing")

    def test_names_and_titles_are_capped_and_printable(self):
        r = Rankings(["A"])
        with self.assertRaises(ValidationError):
            r.add_member("x" * 201)
        with self.assertRaises(ValidationError):
            r.add_member("bad\r\nname")
        with self.assertRaises(ValidationError):
            r.submit_movie("tab\there", "A")
        r.add_member("y" * 200)
        r.submit_movie("Tár & <b>Evil</b>", "A")  # printable non-ASCII and markup are fine (escaped on render)


class CommunityAndLeaderboardTests(unittest.TestCase):
    def test_community_score_is_the_rounded_mean(self):
        r = Rankings(["Sub", "P", "Q"])
        r.submit_movie("M", "Sub")
        r.submit_movie("N", "Sub")
        self.assertIsNone(r.community_score("M"))
        self.assertEqual(r.movie_scores("M"), [])
        r.rank_movie("P", "M", LIKED, scripted())
        r.rank_movie("P", "N", LIKED, scripted(PREFER_OLD))  # P: M 10.0, N 7.0
        r.rank_movie("Q", "M", LIKED, scripted())  # Q: M 8.5
        self.assertEqual(r.community_score("N"), 7.0)
        self.assertEqual(r.community_score("M"), 9.3)  # mean 9.25 -> 9.3
        self.assertEqual(r.movie_scores("M"), [("P", LIKED, 10.0), ("Q", LIKED, 8.5)])

    def test_leaderboard_orders_by_score_received_then_count_then_name(self):
        r = Rankings(["Ann", "Bob", "Cat", "Dan"])
        r.submit_movie("A1", "Ann")
        r.submit_movie("A2", "Ann")
        r.submit_movie("A3", "Ann")
        r.submit_movie("B1", "Bob")
        r.submit_movie("C1", "Cat")
        r.rank_movie("Dan", "A1", LIKED, scripted())  # 8.5
        r.rank_movie("Dan", "A2", LIKED, scripted(PREFER_OLD))  # A1 10.0, A2 7.0
        r.rank_movie("Dan", "B1", FINE, scripted())  # 5.5
        r.rank_movie("Cat", "A1", LIKED, scripted())  # 8.5 -> A1 community 9.3
        board = r.leaderboard()
        self.assertEqual([b.member for b in board], ["Ann", "Bob", "Cat", "Dan"])
        ann, bob, cat, dan = board
        self.assertEqual((ann.value, ann.submitted, ann.ranked), (8.2, 3, 2))  # mean(9.3, 7.0) = 8.15 -> 8.2
        self.assertEqual((bob.value, bob.submitted, bob.ranked), (5.5, 1, 1))
        self.assertEqual((cat.value, cat.submitted, cat.ranked), (None, 1, 0))
        self.assertEqual((dan.value, dan.submitted, dan.ranked), (None, 0, 0))

    def test_leaderboard_spec_example_rounds_half_up(self):
        r = Rankings(["Sub", "Zed", "P", "Q"])
        r.submit_movie("M", "Sub")
        r.submit_movie("N", "Sub")
        r.submit_movie("X", "Zed")
        r.rank_movie("P", "M", LIKED, scripted())  # M 8.5
        r.rank_movie("Q", "N", LIKED, scripted())
        r.rank_movie("Q", "X", LIKED, scripted(PREFER_NEW))  # X 10.0, N 7.0
        self.assertEqual(r.leaderboard()[0].member, "Zed")  # 10.0
        sub = r.leaderboard()[1]
        self.assertEqual((sub.member, sub.value), ("Sub", 7.8))  # mean(8.5, 7.0) = 7.75 -> 7.8


if __name__ == "__main__":
    unittest.main()
