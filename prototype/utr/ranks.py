"""Map pick-quality Elo to League of Legends style ranks.

Elo is unchanged and still starts at 1500. 1500 is the middle of Silver II.
Tiers below Master are cuts on the Elo itself. Grandmaster and Challenger
are chairs: only the current #2 and #1, and only after enough rated picks.
"""

from __future__ import annotations

from typing import Dict, List, Mapping, Optional, Sequence, Tuple

DIVISION_ORDER = ("IV", "III", "II", "I")

# floor is the Elo required to enter the tier. width is one division.
# Four divisions fill the gap to the next tier exactly.
LADDER = (
    ("Bronze", 1240, 40),
    ("Silver", 1400, 40),
    ("Gold", 1560, 40),
    ("Platinum", 1720, 20),
    ("Emerald", 1800, 30),
    ("Diamond", 1920, 40),
    ("Master", 2080, 0),
)
IRON_WIDTH = 40
IRON_FLOOR = LADDER[0][1] - 3 * IRON_WIDTH  # Iron III. Iron IV is everything below.

# Top chairs. The minimum Elo is the Platinum and Emerald floors, so a
# leader who is still Silver keeps that rank.
# Six rated picks is the sample a consistently good picker needs to reach
# Emerald under the recommended step size. See VOLATILITY.md.
CHALLENGER_MIN_PICKS = 6
GRANDMASTER_MIN_PICKS = 6
CHALLENGER_MIN_ELO = 1800
GRANDMASTER_MIN_ELO = 1720

ABSOLUTE_ORDER = ("Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master")


def _tier_span(tier: str) -> Tuple[int, int]:
    for name, floor, width in LADDER:
        if name == tier:
            return floor, width
    raise KeyError(tier)


def division_cuts(tier: str) -> List[Tuple[str, Optional[int]]]:
    """(division, elo required). Iron IV has no floor."""
    if tier == "Iron":
        return [
            ("IV", None),
            ("III", IRON_FLOOR),
            ("II", IRON_FLOOR + IRON_WIDTH),
            ("I", IRON_FLOOR + 2 * IRON_WIDTH),
        ]
    floor, width = _tier_span(tier)
    if tier == "Master":
        return [(None, floor)]
    return [(division, floor + index * width) for index, division in enumerate(DIVISION_ORDER)]


def absolute_rank(elo: float) -> Tuple[str, Optional[str]]:
    """Tier and division from Elo alone. Master has no division."""
    if elo < LADDER[0][1]:
        cuts = division_cuts("Iron")
        # Walk from Iron I down. Iron IV is the open floor.
        for division, floor in reversed(cuts):
            if floor is not None and elo >= floor:
                return "Iron", division
        return "Iron", "IV"
    for (name, floor, width), nxt in zip(LADDER, list(LADDER)[1:] + [None]):
        if name == "Master" or (nxt is not None and elo < nxt[1]) or nxt is None:
            if name == "Master":
                return "Master", None
            index = min(3, int((elo - floor) // width))
            return name, DIVISION_ORDER[index]
    return "Master", None


def format_rank(tier: str, division: Optional[str]) -> str:
    if division is None:
        return tier
    return f"{tier} {division}"


def absolute_label(elo: float) -> str:
    return format_rank(*absolute_rank(elo))


def assign_ranks(
    elos: Mapping[str, float],
    picks: Mapping[str, int],
    base: Optional[Mapping[str, str]] = None,
) -> Dict[str, str]:
    """One label per member. Only the current leaders can hold the top two chairs.

    `base` is the absolute label already chosen for each member (for example
    after the demotion buffer). The chairs replace that label when earned.
    """
    order = sorted(elos, key=lambda name: (-elos[name], name))
    if base is None:
        labels = {name: absolute_label(elos[name]) for name in order}
    else:
        labels = {name: base[name] for name in order}
    if not order:
        return labels
    leader = order[0]
    leader_is_challenger = (
        elos[leader] >= CHALLENGER_MIN_ELO and picks.get(leader, 0) >= CHALLENGER_MIN_PICKS
    )
    if leader_is_challenger:
        labels[leader] = "Challenger"
    # Grandmaster exists only under a Challenger. Second place does not
    # inherit the top chair, and does not wear Grandmaster alone.
    if leader_is_challenger and len(order) > 1:
        second = order[1]
        if elos[second] >= GRANDMASTER_MIN_ELO and picks.get(second, 0) >= GRANDMASTER_MIN_PICKS:
            labels[second] = "Grandmaster"
    return labels


# You step up the moment you cross a line. You step down only after you are
# this far below the line you are holding, so one ordinary close does not
# give the rank back.
DEMOTION_BUFFER = 10


def rank_floor(label: str) -> Optional[int]:
    """Elo required to enter this absolute rank. None for Iron IV."""
    if label == "Master":
        return _tier_span("Master")[0]
    tier, division = label.split()
    for name, floor in division_cuts(tier):
        if name == division:
            return floor
    raise KeyError(label)


def next_absolute(held: str, elo: float) -> str:
    """Promote immediately. Demote only once Elo is DEMOTION_BUFFER below the held floor."""
    natural = absolute_label(elo)
    if rank_index(natural) >= rank_index(held):
        return natural
    floor = rank_floor(held)
    if floor is None or elo >= floor - DEMOTION_BUFFER:
        return held
    return natural


def rank_index(label: str) -> int:
    """Higher is a better displayed rank."""
    special = {"Challenger": 100, "Grandmaster": 99, "Master": 90}
    if label in special:
        return special[label]
    tier, division = label.split()
    return ABSOLUTE_ORDER.index(tier) * 4 + DIVISION_ORDER.index(division)


def cutoff_table() -> Sequence[Tuple[str, str]]:
    """Rows of (rank, requirement), low to high."""
    rows: List[Tuple[str, str]] = []
    for division, floor in division_cuts("Iron"):
        shown = f"below {IRON_FLOOR}" if floor is None else str(floor)
        rows.append((f"Iron {division}", shown))
    for tier, _floor, _width in LADDER:
        for division, floor in division_cuts(tier):
            if division is None:
                rows.append((tier, str(floor)))
            else:
                rows.append((f"{tier} {division}", str(floor)))
    rows.append(
        (
            "Grandmaster",
            f"current #2, and only while #1 is Challenger; Elo at least {GRANDMASTER_MIN_ELO}, and {GRANDMASTER_MIN_PICKS} rated picks",
        )
    )
    rows.append(
        (
            "Challenger",
            f"current #1, Elo at least {CHALLENGER_MIN_ELO}, and {CHALLENGER_MIN_PICKS} rated picks",
        )
    )
    return rows
