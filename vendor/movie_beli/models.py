"""Data types and constants for Beli-style rankings."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from fractions import Fraction
from typing import Any, Mapping, Optional

from .errors import ValidationError

# --------------------------------------------------------------------------- buckets

LIKED = "liked"
FINE = "fine"
DISLIKED = "disliked"
BUCKETS = (LIKED, FINE, DISLIKED)
BUCKET_LABELS = {LIKED: "Liked", FINE: "Fine", DISLIKED: "Didn't like"}


@dataclass(frozen=True)
class BucketRange:
    lo: Fraction
    hi: Fraction
    baseline: Fraction


BUCKET_RANGE = {
    LIKED: BucketRange(Fraction(7), Fraction(10), Fraction("8.5")),
    FINE: BucketRange(Fraction(4), Fraction("6.9"), Fraction("5.5")),
    DISLIKED: BucketRange(Fraction(0), Fraction("3.9"), Fraction(2)),
}

# --------------------------------------------------------------------------- answers

PREFER_NEW = "new"
PREFER_OLD = "old"
TOO_TOUGH = "too_tough"
BACK = "back"
ANSWERS = (PREFER_NEW, PREFER_OLD, TOO_TOUGH, BACK)


def check_bucket(bucket: str) -> str:
    if bucket not in BUCKETS:
        raise ValidationError(f"unknown bucket {bucket!r}; expected one of {', '.join(BUCKETS)}")
    return bucket


MAX_NAME_LENGTH = 200


def check_name(value: object, what: str) -> str:
    """Strip, then require 1..MAX_NAME_LENGTH printable characters (no control characters)."""
    text = str(value).strip() if value is not None else ""
    if not text:
        raise ValidationError(f"{what} must be a non-empty string")
    if len(text) > MAX_NAME_LENGTH:
        raise ValidationError(f"{what} is longer than {MAX_NAME_LENGTH} characters")
    if any(ord(c) < 32 or c == "\x7f" for c in text):
        raise ValidationError(f"{what} must not contain control characters")
    return text


# --------------------------------------------------------------------------- records


@dataclass(frozen=True)
class Movie:
    """A submitted recommendation. ``title`` is the key; exact string match."""

    title: str
    submitted_by: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "title", check_name(self.title, "title"))
        object.__setattr__(self, "submitted_by", check_name(self.submitted_by, "submitted_by"))

    def to_dict(self) -> dict:
        return {"title": self.title, "submitted_by": self.submitted_by}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Movie":
        try:
            return cls(title=str(data["title"]), submitted_by=str(data["submitted_by"]))
        except KeyError as exc:
            raise ValidationError(f"movie is missing required field {exc.args[0]!r}") from exc


@dataclass(frozen=True)
class Ranked:
    """One row of a member's sorted list. ``rank`` is 1-based over all buckets."""

    rank: int
    movie: str
    bucket: str
    score: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class LeaderboardRow:
    """``value`` is the mean community score of the member's ranked submissions."""

    member: str
    value: Optional[float]
    submitted: int
    ranked: int

    def to_dict(self) -> dict:
        return asdict(self)
