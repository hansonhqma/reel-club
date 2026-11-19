"""Per-member ordered lists, binary-search insertion, scores and the leaderboard.

See docs/beli-rankings.md for the spec.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, replace
from fractions import Fraction
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

from .errors import (
    DuplicateMovieError,
    OwnSubmissionError,
    UnknownMemberError,
    UnknownMovieError,
    ValidationError,
)
from .models import (
    ANSWERS,
    BACK,
    BUCKET_RANGE,
    BUCKETS,
    PREFER_NEW,
    PREFER_OLD,
    TOO_TOUGH,
    LeaderboardRow,
    Movie,
    Ranked,
    check_bucket,
    check_name,
)

Answer = str
Ask = Callable[[str, str], Answer]  # ask(new_movie, old_movie) -> one of ANSWERS


# --------------------------------------------------------------------------- score


def _round_tenths(x: Fraction) -> Fraction:
    """Round half up to one decimal, exactly."""
    return Fraction(math.floor(x * 10 + Fraction(1, 2)), 10)


def _mean_tenths(values: Sequence[Fraction]) -> Fraction:
    return _round_tenths(sum(values, Fraction(0)) / len(values))


def _score(bucket: str, position: int, size: int) -> Fraction:
    rng = BUCKET_RANGE[check_bucket(bucket)]
    if size < 1 or not 0 <= position < size:
        raise ValidationError(f"position {position} out of range for a bucket of {size}")
    if size == 1:
        return rng.baseline
    return _round_tenths(rng.hi - (rng.hi - rng.lo) * Fraction(position, size - 1))


def score(bucket: str, position: int, size: int) -> float:
    """Score of the movie at 0-based ``position`` in a bucket holding ``size`` movies."""
    return float(_score(bucket, position, size))


# --------------------------------------------------------------------------- insertion


@dataclass(frozen=True)
class Insertion:
    """Resumable state of one binary-search insertion.

    ``candidates`` is the bucket list when the search started. The new movie
    goes at index ``lo`` once ``done``.
    """

    member: str
    movie: str
    bucket: str
    candidates: Tuple[str, ...]
    lo: int = 0
    hi: int = -1
    history: Tuple[Tuple[int, int], ...] = ()
    rerank: bool = False  # the movie is already ranked; its old placement is swapped out on finish

    def __post_init__(self) -> None:
        if self.hi < 0:
            object.__setattr__(self, "hi", len(self.candidates))

    @property
    def done(self) -> bool:
        return self.lo >= self.hi

    @property
    def pivot(self) -> str:
        """The already-ranked movie to compare against next."""
        if self.done:
            raise ValidationError("insertion is finished; there is no pivot")
        return self.candidates[(self.lo + self.hi) // 2]

    @property
    def questions_left(self) -> int:
        """Upper bound on remaining questions."""
        return math.ceil(math.log2(self.hi - self.lo + 1)) if not self.done else 0

    def answer(self, answer: Answer) -> "Insertion":
        if answer not in ANSWERS:
            raise ValidationError(f"unknown answer {answer!r}; expected one of {', '.join(ANSWERS)}")
        if answer == BACK:
            if not self.history:
                return self
            (lo, hi), history = self.history[-1], self.history[:-1]
            return replace(self, lo=lo, hi=hi, history=history)
        if self.done:
            raise ValidationError("insertion is finished; nothing left to answer")
        mid = (self.lo + self.hi) // 2
        if answer == PREFER_NEW:
            return replace(self, hi=mid, history=self.history + ((self.lo, self.hi),))
        if answer == PREFER_OLD:
            return replace(self, lo=mid + 1, history=self.history + ((self.lo, self.hi),))
        # TOO_TOUGH: tie goes to the incumbent; land just below the pivot and stop.
        return replace(self, lo=mid + 1, hi=mid + 1)

    def to_dict(self) -> dict:
        """Plain JSON-friendly state a host app can store between requests."""
        return {
            "member": self.member,
            "movie": self.movie,
            "bucket": self.bucket,
            "candidates": list(self.candidates),
            "lo": self.lo,
            "hi": self.hi,
            "history": [list(h) for h in self.history],
            "rerank": self.rerank,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Insertion":
        if not isinstance(data, Mapping):
            raise ValidationError("insertion state must be a JSON object")
        try:
            candidates = tuple(str(t) for t in data["candidates"])
            lo, hi = int(data["lo"]), int(data["hi"])
            history = tuple((int(a), int(b)) for a, b in data.get("history", ()))
            state = cls(
                str(data["member"]), str(data["movie"]), check_bucket(data["bucket"]),
                candidates, lo, hi, history, bool(data.get("rerank", False)),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ValidationError(f"malformed insertion state: {exc!r}") from exc
        for a, b in state.history + ((state.lo, state.hi),):
            if not 0 <= a <= b <= len(candidates):
                raise ValidationError("insertion state has lo/hi outside the candidate list")
        return state


# --------------------------------------------------------------------------- rankings


class Rankings:
    """Members, submitted movies and each member's three ordered lists."""

    def __init__(self, members: Iterable[str] = ()) -> None:
        self._members: List[str] = []
        self._movies: Dict[str, Movie] = {}
        self._lists: Dict[str, Dict[str, List[str]]] = {}
        for m in members:
            self.add_member(m)

    # ----------------------------------------------------------------- members

    @property
    def members(self) -> Tuple[str, ...]:
        return tuple(self._members)

    def add_member(self, name: str) -> None:
        name = check_name(name, "member name")
        if name in self._lists:
            raise ValidationError(f"member {name!r} already exists")
        self._members.append(name)
        self._lists[name] = {b: [] for b in BUCKETS}

    def _check_member(self, name: str) -> str:
        if name not in self._lists:
            raise UnknownMemberError(f"unknown member {name!r}")
        return name

    # ----------------------------------------------------------------- movies

    @property
    def movies(self) -> Tuple[Movie, ...]:
        return tuple(self._movies.values())

    def movie(self, title: str) -> Movie:
        try:
            return self._movies[title]
        except KeyError:
            raise UnknownMovieError(f"unknown movie {title!r}") from None

    def submit_movie(self, title: str, submitted_by: str) -> Movie:
        movie = Movie(title, self._check_member(submitted_by))
        if movie.title in self._movies:
            raise DuplicateMovieError(f"movie {movie.title!r} was already submitted")
        self._movies[movie.title] = movie
        return movie

    # ----------------------------------------------------------------- lists

    def bucket_list(self, member: str, bucket: str) -> Tuple[str, ...]:
        return tuple(self._lists[self._check_member(member)][check_bucket(bucket)])

    def bucket_of(self, member: str, title: str) -> Optional[str]:
        for bucket, titles in self._lists[self._check_member(member)].items():
            if title in titles:
                return bucket
        return None

    def rankable(self, member: str) -> Tuple[Movie, ...]:
        """Movies ``member`` may rank: not their own and not yet ranked."""
        self._check_member(member)
        return tuple(
            m for m in self._movies.values()
            if m.submitted_by != member and self.bucket_of(member, m.title) is None
        )

    def start_ranking(self, member: str, title: str, bucket: str) -> Insertion:
        self._check_member(member)
        movie = self.movie(title)
        check_bucket(bucket)
        if movie.submitted_by == member:
            raise OwnSubmissionError(f"{member!r} cannot rank their own submission {title!r}")
        if self.bucket_of(member, title) is not None:
            raise ValidationError(f"{member!r} already ranked {title!r}; remove or re-rank it")
        return Insertion(member, title, bucket, self.bucket_list(member, bucket))

    def start_rerank(self, member: str, title: str, bucket: str) -> Insertion:
        """Like ``start_ranking`` for an already-ranked movie. The old placement stays
        until ``finish_ranking`` applies the new one, so an abandoned or invalid
        re-rank changes nothing."""
        self._check_member(member)
        self.movie(title)
        check_bucket(bucket)
        if self.bucket_of(member, title) is None:
            raise ValidationError(f"{member!r} has not ranked {title!r}")
        candidates = tuple(t for t in self.bucket_list(member, bucket) if t != title)
        return Insertion(member, title, bucket, candidates, rerank=True)

    def finish_ranking(self, insertion: Insertion) -> int:
        """Apply a finished insertion. Returns the index inside the bucket."""
        if not insertion.done:
            raise ValidationError("insertion is not finished")
        member, title = insertion.member, insertion.movie
        current = self.bucket_list(member, insertion.bucket)
        ranked = self.bucket_of(member, title) is not None
        if insertion.rerank:
            if not ranked:
                raise ValidationError(f"{member!r} no longer has {title!r} ranked; start again")
            current = tuple(t for t in current if t != title)
        elif ranked:
            raise ValidationError(f"{member!r} already ranked {title!r}")
        if current != insertion.candidates:
            raise ValidationError("the list changed while ranking; start again")
        if insertion.rerank:
            self.remove(member, title)
        self._lists[member][insertion.bucket].insert(insertion.lo, title)
        return insertion.lo

    def _run(self, state: Insertion, ask: Ask) -> int:
        while not state.done:
            state = state.answer(ask(state.movie, state.pivot))
        return self.finish_ranking(state)

    def rank_movie(self, member: str, title: str, bucket: str, ask: Ask) -> int:
        """Run the whole search with ``ask(new, old)``. Returns the index in the bucket."""
        return self._run(self.start_ranking(member, title, bucket), ask)

    def remove(self, member: str, title: str) -> None:
        bucket = self.bucket_of(member, title)
        if bucket is None:
            raise ValidationError(f"{member!r} has not ranked {title!r}")
        self._lists[member][bucket].remove(title)

    def rerank(self, member: str, title: str, bucket: str, ask: Ask) -> int:
        """Move an already-ranked movie: validate, search, then swap placement atomically."""
        return self._run(self.start_rerank(member, title, bucket), ask)

    # ----------------------------------------------------------------- scores

    def _score_of(self, member: str, title: str) -> Optional[Fraction]:
        bucket = self.bucket_of(member, title)
        if bucket is None:
            return None
        titles = self._lists[member][bucket]
        return _score(bucket, titles.index(title), len(titles))

    def score_of(self, member: str, title: str) -> Optional[float]:
        s = self._score_of(member, title)
        return None if s is None else float(s)

    def member_list(self, member: str) -> List[Ranked]:
        """The member's movies, best first, across all buckets."""
        rows: List[Ranked] = []
        for bucket in BUCKETS:
            titles = self._lists[self._check_member(member)][bucket]
            for p, title in enumerate(titles):
                rows.append(Ranked(len(rows) + 1, title, bucket, score(bucket, p, len(titles))))
        return rows

    def movie_scores(self, title: str) -> List[Tuple[str, str, float]]:
        """``(member, bucket, score)`` for every member who ranked ``title``."""
        self.movie(title)
        out = []
        for member in self._members:
            bucket = self.bucket_of(member, title)
            if bucket is not None:
                out.append((member, bucket, self.score_of(member, title)))
        return out

    def _community(self, title: str) -> Optional[Fraction]:
        scores = [s for s in (self._score_of(m, title) for m in self._members) if s is not None]
        return _mean_tenths(scores) if scores else None

    def community_score(self, title: str) -> Optional[float]:
        """Mean of all members' scores for ``title``; ``None`` when nobody ranked it."""
        self.movie(title)
        c = self._community(title)
        return None if c is None else float(c)

    def leaderboard(self) -> List[LeaderboardRow]:
        rows = []
        for member in self._members:
            own = [m.title for m in self._movies.values() if m.submitted_by == member]
            scores = [c for c in (self._community(t) for t in own) if c is not None]
            value = float(_mean_tenths(scores)) if scores else None
            rows.append(LeaderboardRow(member, value, len(own), len(scores)))
        rows.sort(key=lambda r: (r.value is None, -(r.value or 0.0), -r.ranked, r.member))
        return rows

    # ----------------------------------------------------------------- dict

    def to_dict(self) -> dict:
        return {
            "members": list(self._members),
            "movies": [m.to_dict() for m in self._movies.values()],
            "lists": {m: {b: list(t) for b, t in lists.items()} for m, lists in self._lists.items()},
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Rankings":
        if not isinstance(data, Mapping):
            raise ValidationError("beli data must be a JSON object")
        members, movies, lists = data.get("members", []), data.get("movies", []), data.get("lists", {})
        if not isinstance(members, list) or not isinstance(movies, list) or not isinstance(lists, Mapping):
            raise ValidationError("'members' and 'movies' must be lists and 'lists' an object")
        r = cls(str(m) for m in members)
        for m in movies:
            if not isinstance(m, Mapping):
                raise ValidationError(f"movie entry must be an object, got {m!r}")
            movie = Movie.from_dict(m)
            r.submit_movie(movie.title, movie.submitted_by)
        for member, buckets in lists.items():
            r._check_member(member)
            if not isinstance(buckets, Mapping):
                raise ValidationError(f"lists for {member!r} must be an object")
            for bucket, titles in buckets.items():
                check_bucket(bucket)
                if not isinstance(titles, list):
                    raise ValidationError(f"{member!r}/{bucket} must be a list of titles")
                for title in titles:
                    state = r.start_ranking(member, str(title), bucket)
                    r.finish_ranking(replace(state, lo=state.hi))
        return r
