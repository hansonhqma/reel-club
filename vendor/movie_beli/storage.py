"""JSON persistence for ``Rankings``. Own file, own version; never the movie_elo log."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Mapping, Union

from .errors import ValidationError
from .ranking import Rankings

PathLike = Union[str, Path]
BELI_VERSION = 1


def rankings_to_dict(rankings: Rankings) -> dict:
    data = {"version": BELI_VERSION}
    data.update(rankings.to_dict())
    return data


def rankings_from_dict(data: Mapping[str, Any]) -> Rankings:
    if not isinstance(data, Mapping):
        raise ValidationError("beli data must be a JSON object")
    if data.get("version") != BELI_VERSION:
        raise ValidationError(f"unsupported beli data version {data.get('version')!r}")
    return Rankings.from_dict(data)


def save_rankings(path: PathLike, rankings: Rankings) -> None:
    """Write via a temp file + ``os.replace`` so a crash never leaves a half-written file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(rankings_to_dict(rankings), indent=2), encoding="utf-8")
    os.replace(tmp, path)


def load_rankings(path: PathLike) -> Rankings:
    return rankings_from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
