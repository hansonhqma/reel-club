#!/usr/bin/env python3
"""Stdin/stdout adapter around the vendored movie_beli package.

Reel Club stores each member's three ordered Beli lists in SQLite. Every call
sends the full ranking state (``Rankings.to_dict()`` shape) plus one command
and gets back plain JSON. Nothing is kept between calls and nothing here
implements scoring: positions in, scores out, all from movie_beli.

Commands (``payload["command"]``):

- ``view``   {state, member}                           -> my_list, rankable, movies, leaderboard
- ``start``  {state, member, title, bucket, rerank}    -> step result
- ``step``   {state, insertion, answer?}               -> step result
- ``remove`` {state, member, title}                    -> lists

A step result is ``{done: false, insertion, pivot, questions_left}`` while
questions remain, or ``{done: true, lists, index}`` once the movie is placed;
``lists`` is the member's new ``{liked, fine, disliked}`` title lists.
Errors are ``{"ok": false, "error": message, "type": ExceptionName}`` with
exit code 0, as in elo_bridge.py.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

VENDOR = Path(__file__).resolve().parents[1] / "vendor"
sys.path.insert(0, str(VENDOR))

from movie_beli import Insertion, MovieBeliError, Rankings, ValidationError


def fail(message: str, error_type: str) -> int:
    json.dump({"ok": False, "error": message, "type": error_type}, sys.stdout)
    return 0


def _rankings(payload: dict) -> Rankings:
    return Rankings.from_dict(payload.get("state") or {})


def _text(payload: dict, key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise ValidationError(f"'{key}' must be a string")
    return value


def _step_result(rankings: Rankings, state: Insertion) -> dict:
    if not state.done:
        return {
            "done": False,
            "insertion": state.to_dict(),
            "pivot": state.pivot,
            "questions_left": state.questions_left,
        }
    index = rankings.finish_ranking(state)
    return {"done": True, "lists": rankings.to_dict()["lists"][state.member], "index": index}


def cmd_view(payload: dict) -> dict:
    rankings = _rankings(payload)
    member = _text(payload, "member")
    movies = []
    for movie in rankings.movies:
        scores = rankings.movie_scores(movie.title)
        movies.append(
            {
                "title": movie.title,
                "submitted_by": movie.submitted_by,
                "community_score": rankings.community_score(movie.title),
                "scores": [{"member": m, "bucket": b, "score": s} for m, b, s in scores],
            }
        )
    return {
        "my_list": [row.to_dict() for row in rankings.member_list(member)],
        "rankable": [movie.to_dict() for movie in rankings.rankable(member)],
        "movies": movies,
        "leaderboard": [row.to_dict() for row in rankings.leaderboard()],
    }


def cmd_start(payload: dict) -> dict:
    rankings = _rankings(payload)
    member, title, bucket = _text(payload, "member"), _text(payload, "title"), _text(payload, "bucket")
    if payload.get("rerank"):
        state = rankings.start_rerank(member, title, bucket)
    else:
        state = rankings.start_ranking(member, title, bucket)
    return _step_result(rankings, state)


def cmd_step(payload: dict) -> dict:
    rankings = _rankings(payload)
    state = Insertion.from_dict(payload.get("insertion"))
    answer = payload.get("answer")
    if answer is not None:
        state = state.answer(_text(payload, "answer"))
    return _step_result(rankings, state)


def cmd_remove(payload: dict) -> dict:
    rankings = _rankings(payload)
    member, title = _text(payload, "member"), _text(payload, "title")
    rankings.remove(member, title)
    return {"lists": rankings.to_dict()["lists"][member]}


COMMANDS = {"view": cmd_view, "start": cmd_start, "step": cmd_step, "remove": cmd_remove}


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        return fail(f"invalid JSON: {exc}", "JSONDecodeError")
    if not isinstance(payload, dict):
        return fail("payload must be a JSON object", "ValidationError")

    try:
        handler = COMMANDS.get(payload.get("command"))
        if handler is None:
            raise ValidationError(f"unknown command {payload.get('command')!r}; expected one of {', '.join(COMMANDS)}")
        result = handler(payload)
        result["ok"] = True
        json.dump(result, sys.stdout)
        return 0
    except MovieBeliError as exc:
        return fail(str(exc), type(exc).__name__)
    except Exception as exc:  # surface adapter failures as JSON
        traceback.print_exc(file=sys.stderr)
        return fail(str(exc), type(exc).__name__)


if __name__ == "__main__":
    raise SystemExit(main())
