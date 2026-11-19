"""Exceptions raised by the movie_beli package."""


class MovieBeliError(Exception):
    """Base class for all errors raised by movie_beli."""


class ValidationError(MovieBeliError, ValueError):
    """Input data is malformed or violates a rule."""


class UnknownMemberError(ValidationError):
    """The named member does not exist."""


class UnknownMovieError(ValidationError):
    """The named movie was never submitted."""


class DuplicateMovieError(ValidationError):
    """A movie with this title was already submitted."""


class OwnSubmissionError(ValidationError):
    """A member tried to rank a movie they submitted."""
