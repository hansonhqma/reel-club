"""User taste ratings (UTR) and the Elo replay they drive.

A club has one open movie at a time. Each member either inserts that movie
into a personal three-bucket ordering, or says they did not watch it. When
every active member has answered, the movie closes. Closed ratings never
change. Personal scores are compiled from each ordering and replayed through
the vendored movie_elo league.

This module does not touch the live app.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor"))

from movie_beli import score as beli_score  # noqa: E402
from movie_elo import Params, Week, replay  # noqa: E402

BUCKETS = ("a_lot", "kinda", "not_really")
BELI_BUCKET = {"a_lot": "liked", "kinda": "fine", "not_really": "disliked"}
BASELINE = {"a_lot": 8.5, "kinda": 5.5, "not_really": 2.0}
PREFER_NEW = "new"
PREFER_OLD = "old"
ANSWERS = (PREFER_NEW, PREFER_OLD)


class UtrError(ValueError):
    """The event log breaks a rule of the rating flow."""


def question_budget(already_in_bucket: int) -> int:
    """Most comparisons a binary search will ask. Zero when the bucket is empty."""
    if already_in_bucket <= 0:
        return 0
    return math.ceil(math.log2(already_in_bucket + 1))


@dataclass(frozen=True)
class Search:
    """Binary search for a slot inside one enjoyment bucket. Best is index 0."""

    movie: str
    bucket: str
    candidates: Tuple[str, ...]
    lo: int = 0
    hi: int = -1
    history: Tuple[Tuple[int, int], ...] = ()

    def __post_init__(self) -> None:
        if self.hi < 0:
            object.__setattr__(self, "hi", len(self.candidates))

    @property
    def done(self) -> bool:
        return self.lo >= self.hi

    @property
    def pivot(self) -> str:
        if self.done:
            raise UtrError("the position is already decided")
        return self.candidates[(self.lo + self.hi) // 2]

    @property
    def questions_left(self) -> int:
        if self.done:
            return 0
        return math.ceil(math.log2(self.hi - self.lo + 1))

    def answer(self, choice: str) -> "Search":
        if choice == "back":
            if not self.history:
                return self
            (lo, hi), history = self.history[-1], self.history[:-1]
            return Search(self.movie, self.bucket, self.candidates, lo, hi, history)
        if choice not in ANSWERS:
            raise UtrError("choose the new movie or the one already on the list")
        if self.done:
            raise UtrError("the position is already decided")
        mid = (self.lo + self.hi) // 2
        previous = self.history + ((self.lo, self.hi),)
        if choice == PREFER_NEW:
            return Search(self.movie, self.bucket, self.candidates, self.lo, mid, previous)
        return Search(self.movie, self.bucket, self.candidates, mid + 1, self.hi, previous)


class Taste:
    """One member's total ordering: loved movies, then kinda, then not really."""

    def __init__(self) -> None:
        self.buckets: Dict[str, List[str]] = {bucket: [] for bucket in BUCKETS}

    def movies(self) -> List[str]:
        ordered: List[str] = []
        for bucket in BUCKETS:
            ordered.extend(self.buckets[bucket])
        return ordered

    def bucket_of(self, movie: str) -> Optional[str]:
        for bucket, titles in self.buckets.items():
            if movie in titles:
                return bucket
        return None

    def start(self, movie: str, bucket: str) -> Search:
        if bucket not in BUCKETS:
            raise UtrError("enjoyment is a lot, kinda, or not really")
        if self.bucket_of(movie) is not None:
            raise UtrError(f"{movie} is already on this list")
        return Search(movie, bucket, tuple(self.buckets[bucket]))

    def commit(self, search: Search) -> None:
        if not search.done:
            raise UtrError("the comparisons are not finished")
        if self.bucket_of(search.movie) is not None:
            raise UtrError(f"{search.movie} is already on this list")
        if tuple(self.buckets[search.bucket]) != search.candidates:
            raise UtrError("the list changed while the comparisons were open")
        self.buckets[search.bucket].insert(search.lo, search.movie)

    def place(self, movie: str, bucket: str, answers: Sequence[str]) -> int:
        """Insert a movie. Returns how many comparisons were used."""
        search = self.start(movie, bucket)
        for choice in answers:
            if search.done:
                raise UtrError("more comparisons than this bucket needs")
            search = search.answer(choice)
        if not search.done:
            raise UtrError("not enough comparisons to fix a position")
        self.commit(search)
        return len(answers)

    def scores(self, mapping: str = "beli") -> Dict[str, float]:
        if mapping == "beli":
            return _beli_scores(self)
        if mapping == "clamp":
            return {movie: max(1.0, value) for movie, value in _beli_scores(self).items()}
        if mapping == "baseline":
            out: Dict[str, float] = {}
            for bucket, titles in self.buckets.items():
                for title in titles:
                    out[title] = BASELINE[bucket]
            return out
        if mapping == "rank":
            ordered = self.movies()
            count = len(ordered)
            if count == 0:
                return {}
            if count == 1:
                return {ordered[0]: 5.5}
            return {
                title: 10.0 - 9.0 * index / (count - 1)
                for index, title in enumerate(ordered)
            }
        raise UtrError(f"unknown score mapping {mapping}")


def _beli_scores(taste: Taste) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for bucket, titles in taste.buckets.items():
        size = len(titles)
        beli_bucket = BELI_BUCKET[bucket]
        for position, title in enumerate(titles):
            out[title] = float(beli_score(beli_bucket, position, size))
    return out


@dataclass
class ClosedMovie:
    title: str
    suggester: str
    ratings: Dict[str, Tuple[str, Tuple[str, ...]]]
    skipped: Tuple[str, ...]


@dataclass
class _Open:
    title: str
    suggester: str
    pending: Dict[str, Tuple] = field(default_factory=dict)


class Club:
    """Append-only club. Replay the event list; do not edit a closed movie."""

    def __init__(self) -> None:
        self.members: List[str] = []
        self.active: List[str] = []
        self.tastes: Dict[str, Taste] = {}
        self.open: Optional[_Open] = None
        self.closed: List[ClosedMovie] = []
        self._known: set = set()

    def replay(self, events: Iterable[Mapping]) -> "Club":
        for event in events:
            self.apply(dict(event))
        return self

    def apply(self, event: Mapping) -> None:
        kind = event.get("type")
        if kind == "join":
            self._join(str(event["user"]))
        elif kind == "leave":
            self._leave(str(event["user"]))
        elif kind == "suggest":
            self._suggest(str(event["user"]), str(event["movie"]))
        elif kind == "rate":
            self._rate(
                str(event["user"]),
                str(event["movie"]),
                str(event["bucket"]),
                tuple(event.get("answers") or ()),
            )
        elif kind == "skip":
            self._skip(str(event["user"]), str(event["movie"]))
        elif kind == "admin_close":
            self._admin_close(str(event["movie"]))
        elif kind == "close":
            self._close_by(str(event["movie"]), str(event.get("by") or ""), bool(event.get("admin")))
        else:
            raise UtrError(f"unknown event {kind}")

    def _join(self, user: str) -> None:
        if user in self._known:
            raise UtrError(f"{user} is already in the club")
        self._known.add(user)
        self.members.append(user)
        self.active.append(user)
        self.tastes[user] = Taste()

    def _leave(self, user: str) -> None:
        if user not in self.active:
            raise UtrError(f"{user} is not an active member")
        self.active.remove(user)
        self._maybe_close()

    def _suggest(self, user: str, movie: str) -> None:
        if self.open is not None:
            raise UtrError(f"finish {self.open.title} before suggesting another movie")
        if user not in self.active:
            raise UtrError(f"{user} cannot suggest right now")
        if movie in {item.title for item in self.closed}:
            raise UtrError(f"{movie} was already rated")
        self.open = _Open(movie, user)

    def _rate(self, user: str, movie: str, bucket: str, answers: Tuple[str, ...]) -> None:
        current = self._require_response(user, movie)
        # Validate against the list as it will stand at close. The open movie
        # is not inserted until close, so a replacement sees the same list.
        search = self.tastes[user].start(movie, bucket)
        for choice in answers:
            if choice not in ANSWERS:
                raise UtrError("a saved rating only contains new or old")
            if search.done:
                raise UtrError("more comparisons than this bucket needs")
            search = search.answer(choice)
        if not search.done:
            raise UtrError("not enough comparisons to fix a position")
        current.pending[user] = ("rate", bucket, answers)
        self._maybe_close()

    def _skip(self, user: str, movie: str) -> None:
        current = self._require_response(user, movie)
        if user == current.suggester:
            raise UtrError("the suggester watched this movie and rates it")
        current.pending[user] = ("skip",)
        self._maybe_close()

    def _admin_close(self, movie: str) -> None:
        self._close_early(movie)

    def _close_by(self, movie: str, by: str, admin: bool) -> None:
        if self.open is None or self.open.title != movie:
            raise UtrError(f"{movie} is not the open movie")
        if not admin and by != self.open.suggester:
            raise UtrError("only the suggester or an admin can close ratings")
        self._close_early(movie)

    def _close_early(self, movie: str) -> None:
        """Close now. Anyone still silent is recorded as not having watched."""
        if self.open is None or self.open.title != movie:
            raise UtrError(f"{movie} is not the open movie")
        for user in list(self.active):
            if user not in self.open.pending:
                self.open.pending[user] = ("skip",)
        self._close()

    def _require_response(self, user: str, movie: str) -> _Open:
        if self.open is None or self.open.title != movie:
            raise UtrError(f"{movie} is not open for ratings")
        if user not in self.members:
            raise UtrError(f"{user} is not in the club")
        if user not in self.active:
            raise UtrError(f"{user} has left and cannot rate this movie")
        return self.open

    def _maybe_close(self) -> None:
        if self.open is None:
            return
        if all(user in self.open.pending for user in self.active):
            self._close()

    def _close(self) -> None:
        assert self.open is not None
        current = self.open
        ratings: Dict[str, Tuple[str, Tuple[str, ...]]] = {}
        skipped: List[str] = []
        # Member order keeps a replay deterministic if several lists were updated together.
        for user in self.members:
            item = current.pending.get(user)
            if item is None:
                continue
            if item[0] == "skip":
                skipped.append(user)
                continue
            _, bucket, answers = item
            self.tastes[user].place(current.title, bucket, answers)
            ratings[user] = (bucket, answers)
        self.closed.append(ClosedMovie(current.title, current.suggester, ratings, tuple(skipped)))
        self.open = None

    def elo_inputs(self, mapping: str = "beli") -> List[Week]:
        """Weeks for movie_elo, using each list as it stands now.

        A later rating can move an older movie's score. Those current scores
        are what every closed movie is fed. The suggester's own score is left out.
        """
        compiled = {user: self.tastes[user].scores(mapping) for user in self.members}
        weeks: List[Week] = []
        for movie in self.closed:
            ratings = {}
            for user in movie.ratings:
                if user == movie.suggester:
                    continue
                value = compiled[user][movie.title]
                ratings[user] = (value, value)
            if not ratings:
                continue
            weeks.append(
                Week(
                    week_id=movie.title,
                    suggester=movie.suggester,
                    movie=movie.title,
                    ratings=ratings,
                )
            )
        return weeks

    def league(self, mapping: str = "beli"):
        scale_min = 0.0 if mapping == "beli" else 1.0
        params = Params(scale_min=scale_min, scale_max=10.0)
        return replay(self.members, self.elo_inputs(mapping), params)


_BELI_BUCKETS = {
    "liked": "a_lot",
    "fine": "kinda",
    "disliked": "not_really",
    "a_lot": "a_lot",
    "kinda": "kinda",
    "not_really": "not_really",
}


def seed_taste(
    beli_order: Optional[Sequence[Tuple[str, str]]] = None,
    blended_scores: Optional[Mapping[str, float]] = None,
) -> Taste:
    """Start a list from today's data without inventing comparison questions.

    A Beli order wins when one exists. It is ``(movie, bucket)`` pairs, best
    first inside each bucket. Otherwise movies are sorted by the old blended
    score and dropped into a lot / kinda / not really by the 7 and 4 cuts.
    """
    taste = Taste()
    if beli_order:
        for movie, raw_bucket in beli_order:
            bucket = _BELI_BUCKETS.get(raw_bucket)
            if bucket is None:
                raise UtrError("a Beli bucket is liked, fine, or didn't like")
            if taste.bucket_of(movie) is not None:
                raise UtrError(f"{movie} is already on this list")
            taste.buckets[bucket].append(movie)
        return taste
    if not blended_scores:
        return taste
    ranked = sorted(blended_scores.items(), key=lambda item: (-item[1], item[0]))
    for movie, value in ranked:
        if value >= 7:
            bucket = "a_lot"
        elif value >= 4:
            bucket = "kinda"
        else:
            bucket = "not_really"
        taste.buckets[bucket].append(movie)
    return taste
