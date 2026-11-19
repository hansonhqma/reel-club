"""Beli-style personal movie rankings: buckets, pairwise comparisons, 0-10 scores.

Independent of ``movie_elo``. Spec: docs/beli-rankings.md.
"""
from .errors import (
    DuplicateMovieError,
    MovieBeliError,
    OwnSubmissionError,
    UnknownMemberError,
    UnknownMovieError,
    ValidationError,
)
from .models import (
    ANSWERS,
    BACK,
    BUCKET_LABELS,
    BUCKET_RANGE,
    BUCKETS,
    DISLIKED,
    FINE,
    LIKED,
    PREFER_NEW,
    PREFER_OLD,
    TOO_TOUGH,
    LeaderboardRow,
    Movie,
    Ranked,
)
from .ranking import Insertion, Rankings, score
from .storage import BELI_VERSION, load_rankings, rankings_from_dict, rankings_to_dict, save_rankings

__version__ = "0.1.0"

__all__ = [
    "ANSWERS",
    "BACK",
    "BELI_VERSION",
    "BUCKETS",
    "BUCKET_LABELS",
    "BUCKET_RANGE",
    "DISLIKED",
    "DuplicateMovieError",
    "FINE",
    "Insertion",
    "LIKED",
    "LeaderboardRow",
    "Movie",
    "MovieBeliError",
    "OwnSubmissionError",
    "PREFER_NEW",
    "PREFER_OLD",
    "Ranked",
    "Rankings",
    "TOO_TOUGH",
    "UnknownMemberError",
    "UnknownMovieError",
    "ValidationError",
    "load_rankings",
    "rankings_from_dict",
    "rankings_to_dict",
    "save_rankings",
    "score",
]
