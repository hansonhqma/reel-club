"""Elo levers for a faster rank climb, measured in a picker's own picks.

The live app is untouched. Run from the repo root:

    python3 prototype/utr/volatility.py

Writes prototype/utr/results/volatility.md and volatility.json.
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "vendor"))

from movie_elo import League, Params, Week
from movie_elo.models import Pick

from prototype.utr.rank_sim import play
from prototype.utr.ranks import absolute_label, next_absolute, rank_index

OUT = Path(__file__).resolve().parent / "results"
PAR = "__par__"
NEUTRAL = 5.5
SIZES = (4, 6, 8)
GATES = (("Gold", 1560.0), ("Platinum", 1720.0), ("Emerald", 1800.0))
HIGH = {"Platinum", "Emerald", "Diamond", "Master", "Grandmaster", "Challenger"}
LOW = {"Iron", "Bronze"}
HOME = {"Silver", "Gold"}


def roster(size):
    names = [f"M{index}" for index in range(size)]
    roles = {names[0]: "good", names[-1]: "bad"}
    for name in names[1:-1]:
        roles[name] = "average"
    return names, roles


def params_of(spec):
    return Params(
        k=spec["k"],
        d=spec["d"],
        w=spec.get("w", 400.0),
        alpha=spec.get("alpha", 0.5),
        scale_min=0.0,
        scale_max=10.0,
        provisional_picks=spec.get("provisional_picks", 0),
        k_provisional=spec.get("k_provisional"),
    )


def weeks_from(movies, up_to, scores):
    weeks = []
    for movie in movies[:up_to]:
        ratings = {}
        for user in movie.ratings:
            if user == movie.suggester:
                continue
            ratings[user] = (scores[user][movie.title], scores[user][movie.title])
        if ratings:
            weeks.append(Week(movie.title, movie.suggester, movie.title, ratings))
    return weeks


def _park(league, people):
    """Give the phantom a neutral pick without playing a week of its own."""
    if PAR not in league.members:
        league.add_member(PAR)
    league._pick_counts[PAR] = 99
    league._picks[PAR] = Pick(
        PAR,
        "par",
        "par",
        {member: (NEUTRAL, NEUTRAL) for member in people},
        99,
        league.week_count,
    )


def run_league(members, weeks, params, baseline):
    """Replay weeks. baseline 'opening' parks a 1500 neutral pick for the first week only.

    'first' does that on every member's first played pick. Points the phantom
    wins or loses are handed back by recentering, so the club mean stays 1500.
    """
    people = list(members)
    if baseline == "off" or not weeks:
        league = League(people, params)
        for week in weeks:
            league.play_week(week)
        return league.elo, league.pick_counts
    league = League(people, params)
    seen = set()
    for index, week in enumerate(weeks):
        first = week.suggester not in seen
        seen.add(week.suggester)
        inject = (baseline == "opening" and index == 0) or (baseline == "first" and first)
        if inject:
            _park(league, people)
        league.play_week(week)
        if inject:
            league.remove_member(PAR, recenter=True)
    return league.elo, league.pick_counts


def tier_of(label):
    if label in ("Challenger", "Grandmaster", "Master"):
        return label
    return label.split()[0]


def apply_chairs(elos, picks, held, min_picks, challenger_elo, grandmaster_elo):
    labels = {name: held[name] for name in elos}
    order = sorted(elos, key=lambda name: (-elos[name], name))
    if not order:
        return labels
    leader = order[0]
    ready = elos[leader] >= challenger_elo and picks.get(leader, 0) >= min_picks
    if not ready:
        return labels
    labels[leader] = "Challenger"
    if len(order) > 1:
        second = order[1]
        if elos[second] >= grandmaster_elo and picks.get(second, 0) >= min_picks:
            labels[second] = "Grandmaster"
    return labels


def sized_spec(spec, size):
    """Scale K so five opponents (a 6-person club) is the reference week."""
    spec = dict(spec)
    if spec.get("scale"):
        factor = 5 / (size - 1)
        spec["k"] = spec["k"] * factor
        if spec.get("k_provisional"):
            spec["k_provisional"] = spec["k_provisional"] * factor
    return spec


def career(group, spec):
    """Elo and displayed rank after every close, under one setting."""
    spec = sized_spec(spec, len(group.members))
    params = params_of(spec)
    minimum = spec["min_picks"]
    held = {member: absolute_label(1500.0) for member in group.members}
    previous = dict(held)
    rows = []
    flips = {member: 0 for member in group.members}
    tier_flips = {member: 0 for member in group.members}
    for index in range(len(group.closed)):
        scores = group.closed[index].scores
        weeks = weeks_from(group.closed, index + 1, scores)
        elo, picks = run_league(group.members, weeks, params, spec["baseline"])
        for member in group.members:
            held[member] = next_absolute(held[member], elo[member])
        labels = apply_chairs(elo, picks, held, minimum, spec["challenger_elo"], spec["grandmaster_elo"])
        for member in group.members:
            if labels[member] == previous[member]:
                continue
            flips[member] += 1
            if tier_of(labels[member]) != tier_of(previous[member]):
                tier_flips[member] += 1
        previous = labels
        rows.append({"elo": elo, "picks": picks, "ranks": labels, "absolute": dict(held)})
    closes = max(1, len(rows))
    return rows, {member: flips[member] / closes for member in flips}, {
        member: tier_flips[member] / closes for member in tier_flips
    }


def own_picks_at(rows, member, elo_floor):
    for row in rows:
        if row["elo"][member] >= elo_floor:
            return row["picks"].get(member, 0)
    return None


def picks_when_label(rows, member, label):
    for row in rows:
        if row["ranks"][member] == label:
            return row["picks"].get(member, 0)
    return None


def snapshot_at_picks(rows, member, needed):
    for row in rows:
        if row["picks"].get(member, 0) >= needed:
            return row
    return None


def median(values):
    values = [value for value in values if value is not None]
    if not values:
        return None
    return statistics.median(values)


def mean(values):
    if not values:
        return None
    return statistics.fmean(values)


def fresh():
    return {
        "gates": {name: [] for name, _floor in GATES},
        "challenger": [],
        "grandmaster": [],
        "elo_at": {6: []},
        "rank_at_6": [],
        "avg_high": [],
        "avg_low": [],
        "bad_high": [],
        "good_low": [],
        "good_not_first": [],
        "flip": [],
        "tier_flip": [],
        "final_tier": [],
    }


def consume(bucket, role, rows, flips, tier_flips, name):
    for gate, floor in GATES:
        hit = own_picks_at(rows, name, floor)
        if hit is not None:
            bucket["gates"][gate].append(hit)
    chair = picks_when_label(rows, name, "Challenger")
    if chair is not None:
        bucket["challenger"].append(chair)
    chair = picks_when_label(rows, name, "Grandmaster")
    if chair is not None:
        bucket["grandmaster"].append(chair)
    snap = snapshot_at_picks(rows, name, 6)
    if snap is not None:
        bucket["elo_at"][6].append(snap["elo"][name])
        bucket["rank_at_6"].append(snap["ranks"][name])
        if role == "good":
            order = sorted(snap["elo"], key=lambda member: (-snap["elo"][member], member))
            bucket["good_not_first"].append(0 if order[0] == name else 1)
    bucket["flip"].append(flips[name])
    bucket["tier_flip"].append(tier_flips[name])
    bucket["final_tier"].append(tier_of(rows[-1]["ranks"][name]))
    high = low = bad_high = good_low = 0
    seen = 0
    good_seen = 0
    for row in rows:
        seen += 1
        tier = tier_of(row["ranks"][name])
        if role == "average":
            high += tier in HIGH
            low += tier in LOW
        elif role == "bad":
            bad_high += tier in HIGH or tier == "Gold"
        elif role == "good" and row["picks"].get(name, 0) >= 2:
            good_seen += 1
            good_low += tier in {"Iron", "Bronze", "Silver"}
    if role == "average" and seen:
        bucket["avg_high"].append(high / seen)
        bucket["avg_low"].append(low / seen)
    if role == "bad" and seen:
        bucket["bad_high"].append(bad_high / seen)
    if role == "good" and good_seen:
        bucket["good_low"].append(good_low / good_seen)


def simulate(spec, seeds, sizes):
    """Same worlds shared across the caller's settings only if the caller reuses groups.

    This function builds its own worlds so a single setting can be timed alone.
    """
    out = {size: {"good": fresh(), "average": fresh(), "bad": fresh(), "careers": {}} for size in sizes}
    for size in sizes:
        names, roles = roster(size)
        movies = size * spec.get("pick_horizon", 10)
        counts = {"good": 0, "average": 0, "bad": 0}
        for seed in range(seeds):
            group = play(names, roles, movies, seed=spec.get("seed_base", 4000) + size * 100 + seed)
            rows, flips, tier_flips = career(group, spec)
            for name, role in roles.items():
                counts[role] += 1
                consume(out[size][role], role, rows, flips, tier_flips, name)
        out[size]["careers"] = counts
    return out


def simulate_shared(specs, seeds, sizes):
    """One set of clubs, many Elo settings, so the comparison is not a new draw."""
    worlds = {}
    horizon = max(spec.get("pick_horizon", 10) for spec in specs)
    for size in sizes:
        names, roles = roster(size)
        worlds[size] = []
        for seed in range(seeds):
            group = play(names, roles, size * horizon, seed=4000 + size * 100 + seed)
            worlds[size].append((group, roles))
    results = {}
    for spec in specs:
        key = spec["name"]
        results[key] = {size: {"good": fresh(), "average": fresh(), "bad": fresh(), "careers": {}} for size in sizes}
        for size in sizes:
            counts = {"good": 0, "average": 0, "bad": 0}
            for group, roles in worlds[size]:
                rows, flips, tier_flips = career(group, spec)
                # Trim nothing: every spec sees the full horizon.
                for name, role in roles.items():
                    counts[role] += 1
                    consume(results[key][size][role], role, rows, flips, tier_flips, name)
            results[key][size]["careers"] = counts
    return results


def fmt_picks(values, careers):
    if not values:
        return "–"
    shown = f"{median(values):.0f}"
    if len(values) * 2 < careers:
        return f"{shown} ({len(values)}/{careers})"
    return shown


def pack(result):
    packed = {}
    for size, roles in result.items():
        packed[str(size)] = {}
        for role in ("good", "average", "bad"):
            bucket = roles[role]
            packed[str(size)][role] = {
                "careers": roles["careers"][role],
                "gates": {gate: median(bucket["gates"][gate]) for gate, _f in GATES},
                "gate_n": {gate: len(bucket["gates"][gate]) for gate, _f in GATES},
                "challenger": median(bucket["challenger"]),
                "challenger_n": len(bucket["challenger"]),
                "elo_at_6": mean(bucket["elo_at"][6]),
                "flip": mean(bucket["flip"]),
                "tier_flip": mean(bucket["tier_flip"]),
                "avg_high": mean(bucket["avg_high"]),
                "avg_low": mean(bucket["avg_low"]),
                "bad_high": mean(bucket["bad_high"]),
                "good_low": mean(bucket["good_low"]),
                "good_not_first": mean(bucket["good_not_first"]),
            }
    return packed


def check_matches_default(group):
    """The prototype replay and Club.league agree when params are the current ones."""
    spec = {
        "k": 32,
        "d": 2,
        "w": 400,
        "baseline": "off",
        "min_picks": 10,
        "challenger_elo": 1800,
        "grandmaster_elo": 1720,
    }
    scores = group.closed[-1].scores
    weeks = weeks_from(group.closed, len(group.closed), scores)
    elo, _picks = run_league(group.members, weeks, params_of(spec), "off")
    official = group.league().elo
    for member in group.members:
        if abs(elo[member] - official[member]) > 1e-6:
            raise AssertionError(f"replay drifted for {member}: {elo[member]} vs {official[member]}")


SPECS = []  # filled by the caller in main for the written comparison


def write_report(results, specs, seeds):
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Elo levers for a faster climb",
        "",
        "Progress is counted in a picker's own rated picks, not in club-weeks.",
        "A rated pick is a movie they suggested that at least one other member scored.",
        f"Each cell is the median across {seeds} seasons. A count in parentheses means fewer than half of those careers got there.",
        "Clubs of 4, 6, and 8 take turns one movie at a time. One picker is consistently good, one is weak, and the rest are typical.",
        "The same seasons are replayed under every setting.",
        "",
        "Alpha does nothing here: a list contributes one score, and that score is copied into both Elo inputs, so the blend is the score either way.",
        "Making score gaps count more is the `d` parameter. A smaller `d` is the same lever as stretching the 0–10 differences.",
        "The opening-movie baseline gives the first played movie one extra match against a neutral 5.5 pick at 1500, then removes that phantom and recenters. It is off unless a setting says otherwise.",
        "",
        "## Settings",
        "",
        "| Setting | K | d | Provisional | Baseline | Challenger minimum |",
        "|---|---:|---:|---|---|---:|",
    ]
    for spec in specs:
        provisional = "–"
        if spec.get("provisional_picks"):
            provisional = f"first {spec['provisional_picks']} picks at K {spec['k_provisional']:g}"
        k_shown = f"{spec['k']:g} × 5/(n−1)" if spec.get("scale") else f"{spec['k']:g}"
        lines.append(
            f"| {spec['name']} | {k_shown} | {spec['d']:g} | {provisional} | {spec['baseline']} | {spec['min_picks']} |"
        )
    lines += [
        "",
        "Challenger is still only the current #1, and only at Elo 1800 or higher once the minimum picks are in.",
        "Grandmaster is only #2, and only while someone is Challenger, at Elo 1720 or higher with the same pick minimum.",
        "Where K is scaled, a 4-person club uses K 53.3, a 6-person club uses K 32, and an 8-person club uses K 22.9.",
        "Rank lines are unchanged: Gold 1560, Platinum 1720, Emerald 1800. 1500 stays the middle of Silver II.",
        "",
    ]
    for spec in specs:
        result = results[spec["name"]]
        lines += [f"## {spec['name']}", ""]
        lines.append("| Club | Good to Gold | Good to Plat | Good to Emerald | Good to Challenger | Elo at own pick 6 |")
        lines.append("|---:|---:|---:|---:|---:|---:|")
        for size in SIZES:
            good = result[size]["good"]
            careers = result[size]["careers"]["good"]
            elo6 = good["elo_at"][6]
            lines.append(
                "| {size} | {gold} | {plat} | {emerald} | {chair} | {elo} |".format(
                    size=size,
                    gold=fmt_picks(good["gates"]["Gold"], careers),
                    plat=fmt_picks(good["gates"]["Platinum"], careers),
                    emerald=fmt_picks(good["gates"]["Emerald"], careers),
                    chair=fmt_picks(good["challenger"], careers),
                    elo=f"{mean(elo6):.0f}" if elo6 else "–",
                )
            )
        lines += [
            "",
            "| Club | Average outside Silver/Gold, high | Average outside, low | Bad at Gold or above | Good still Silver after 2 picks | Good not #1 at pick 6 | Label flip, avg | Tier flip, avg |",
            "|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for size in SIZES:
            average = result[size]["average"]
            bad = result[size]["bad"]
            good = result[size]["good"]
            lines.append(
                "| {size} | {high:.0%} | {low:.0%} | {bad:.0%} | {silver:.0%} | {first:.0%} | {flip:.0%} | {tier:.0%} |".format(
                    size=size,
                    high=mean(average["avg_high"]) or 0,
                    low=mean(average["avg_low"]) or 0,
                    bad=mean(bad["bad_high"]) or 0,
                    silver=mean(good["good_low"]) or 0,
                    first=mean(good["good_not_first"]) or 0,
                    flip=mean(average["flip"]) or 0,
                    tier=mean(average["tier_flip"]) or 0,
                )
            )
        lines.append("")
        lines.append(
            "Good picker's own label-flip rate: "
            + ", ".join(f"{size} members {mean(result[size]['good']['flip']):.0%}" for size in SIZES)
            + "."
        )
        lines.append("")
    text = "\n".join(lines)
    (OUT / "volatility.md").write_text(text, encoding="utf-8")
    payload = {
        "seeds": seeds,
        "specs": [
            {key: spec[key] for key in spec if key != "k_provisional" or spec.get("k_provisional") is not None}
            for spec in specs
        ],
        "results": {spec["name"]: pack(results[spec["name"]]) for spec in specs},
    }
    (OUT / "volatility.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return text


def main():
    names, roles = roster(6)
    check = play(names, roles, 12, seed=1)
    check_matches_default(check)
    shared = dict(
        w=400,
        baseline="off",
        challenger_elo=1800,
        grandmaster_elo=1720,
        pick_horizon=10,
        scale=True,
    )
    specs = [
        {
            "name": "current",
            "k": 32,
            "d": 2,
            "w": 400,
            "baseline": "off",
            "min_picks": 10,
            "challenger_elo": 1800,
            "grandmaster_elo": 1720,
            "pick_horizon": 10,
            "scale": False,
        },
        dict(name="mild", k=32, d=1.75, min_picks=6, **shared),
        dict(name="medium", k=32, d=1.5, min_picks=6, **shared),
        dict(name="spicy", k=32, d=1.25, min_picks=6, **shared),
    ]
    seeds = 16
    print("replaying", seeds, "seasons, sizes", SIZES, flush=True)
    results = simulate_shared(specs, seeds, SIZES)
    text = write_report(results, specs, seeds)
    extra = two_standouts(specs[2], seeds)
    text = text + "\n" + extra
    (OUT / "volatility.md").write_text(text, encoding="utf-8")
    print(text)


def two_standouts(spec, seeds):
    """Two good pickers in a 6-person club, so second place can earn Grandmaster."""
    names = [f"M{index}" for index in range(6)]
    roles = {
        names[0]: "good",
        names[1]: "good",
        names[2]: "average",
        names[3]: "average",
        names[4]: "average",
        names[5]: "bad",
    }
    buckets = {role: fresh() for role in ("good", "average", "bad")}
    counts = {role: 0 for role in buckets}
    for seed in range(seeds):
        group = play(names, roles, 6 * spec["pick_horizon"], seed=9000 + seed)
        rows, flips, tier_flips = career(group, spec)
        for name, role in roles.items():
            counts[role] += 1
            consume(buckets[role], role, rows, flips, tier_flips, name)
    good = buckets["good"]
    lines = [
        "## Two good pickers, medium setting, 6 members",
        "",
        "A second strong picker can be Grandmaster. The minimum is the same 6 rated picks.",
        "",
        f"- Challenger: {fmt_picks(good['challenger'], counts['good'])} own picks, {len(good['challenger'])}/{counts['good']} careers.",
        f"- Grandmaster: {fmt_picks(good['grandmaster'], counts['good'])} own picks, {len(good['grandmaster'])}/{counts['good']} careers.",
        f"- Average pickers who reached Grandmaster: {len(buckets['average']['grandmaster'])}/{counts['average']}.",
        f"- Average pickers who reached Challenger: {len(buckets['average']['challenger'])}/{counts['average']}.",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
