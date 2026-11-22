"""How fast good, average, and bad pickers climb the proposed ladder.

Run from the repo root:

    python prototype/utr/rank_sim.py

Writes prototype/utr/results/ranks.md and ranks.json.
"""

from __future__ import annotations

import json
import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "vendor"))

from prototype.utr.ranks import (
    CHALLENGER_MIN_ELO,
    CHALLENGER_MIN_PICKS,
    DEMOTION_BUFFER,
    GRANDMASTER_MIN_ELO,
    GRANDMASTER_MIN_PICKS,
    absolute_label,
    assign_ranks,
    cutoff_table,
    next_absolute,
    rank_index,
)
from prototype.utr.simulate import answers_for, attendance, bucket_for
from prototype.utr.utr import Club

OUT = Path(__file__).resolve().parent / "results"
HORIZONS = (10, 20, 30, 40, 60, 100)
ROLES = ("good", "average", "bad")
SKILL = {"good": 1.15, "average": 0.0, "bad": -1.15}
TARGETS = ("Gold IV", "Platinum IV", "Emerald IV", "Diamond IV", "Master")
FALL_TARGETS = ("Bronze I", "Iron I")


def roster(pattern="main"):
    names = ["Avery", "Blair", "Casey", "Drew", "Ellis", "Frankie"]
    if pattern == "main":
        roles = ["good", "average", "average", "average", "average", "bad"]
    else:
        roles = ["good", "good", "average", "average", "average", "bad"]
    return names, dict(zip(names, roles))


def draw_skilled(names, roles, movies, seed):
    rng = random.Random(seed)
    enjoyment = {name: {} for name in names}
    for index, movie in enumerate(movies):
        owner = names[index % len(names)]
        quality = SKILL[roles[owner]] + rng.gauss(0, 0.45)
        for name in names:
            bias = 0.15 if roles[name] == "good" else (-0.15 if roles[name] == "bad" else 0.0)
            enjoyment[name][movie] = quality + bias + rng.gauss(0, 0.4)
    return enjoyment


def rated_picks(group, up_to):
    counts = {member: 0 for member in group.members}
    for movie in group.closed[:up_to]:
        if any(user != movie.suggester for user in movie.ratings):
            counts[movie.suggester] = counts.get(movie.suggester, 0) + 1
    return counts


def play(names, roles, movie_count, seed, flip=0.08, skip=0.12):
    movies = [f"M{index:02d}" for index in range(movie_count)]
    enjoyment = draw_skilled(names, roles, movies, seed)
    suggesters = {movie: names[index % len(names)] for index, movie in enumerate(movies)}
    present = attendance(names, movies, suggesters, seed + 3, skip)
    group = Club()
    for name in names:
        group.apply({"type": "join", "user": name})
    for movie in movies:
        group.apply({"type": "suggest", "user": suggesters[movie], "movie": movie})
        for name in names:
            if name not in present[movie]:
                group.apply({"type": "skip", "user": name, "movie": movie})
                continue
            bucket = bucket_for(enjoyment[name][movie])
            rng = random.Random(f"{seed}:answer:{name}:{movie}")
            answers = answers_for(group.tastes[name], movie, bucket, enjoyment, name, rng, flip)
            group.apply(
                {"type": "rate", "user": name, "movie": movie, "bucket": bucket, "answers": answers}
            )
    return group


def path_for(group):
    """Elo and displayed rank after every close."""
    elo = {member: 1500.0 for member in group.members}
    held = {member: absolute_label(1500.0) for member in group.members}
    previous = dict(held)
    label_flips = {member: 0 for member in group.members}
    tier_flips = {member: 0 for member in group.members}
    other_flips = {member: 0 for member in group.members}
    rows = []
    for index in range(len(group.closed)):
        change = group.close_change(index)
        elo = {member: elo[member] + change["total"][member] for member in group.members}
        picks = rated_picks(group, index + 1)
        for member in group.members:
            held[member] = next_absolute(held[member], elo[member])
        labels = assign_ranks(elo, picks, held)
        owner = group.closed[index].suggester
        for member in group.members:
            if labels[member] == previous[member]:
                continue
            label_flips[member] += 1
            if member != owner:
                other_flips[member] += 1
            if labels[member].split()[0] != previous[member].split()[0]:
                tier_flips[member] += 1
        previous = labels
        rows.append(
            {
                "elo": dict(elo),
                "picks": dict(picks),
                "ranks": labels,
                "absolute": dict(held),
            }
        )
    closes = len(group.closed)
    return rows, label_flips, tier_flips, other_flips, closes


def first_absolute(rows, member, target, downward=False):
    goal = rank_index(target)
    for index, row in enumerate(rows, start=1):
        current = rank_index(row["absolute"][member])
        if (current <= goal) if downward else (current >= goal):
            return index
    return None


def first_label(rows, member, label):
    for index, row in enumerate(rows, start=1):
        if row["ranks"][member] == label:
            return index
    return None


def fresh_role():
    return {
        "hits": {target: [] for target in TARGETS},
        "falls": {target: [] for target in FALL_TARGETS},
        "chairs": {"Challenger": [], "Grandmaster": []},
        "elo": {horizon: [] for horizon in HORIZONS},
        "label_flip": [],
        "tier_flip": [],
        "other_flip": [],
        "final": [],
    }


def summarize(seeds, movie_count, pattern):
    names, roles = roster(pattern)
    by_role = {role: fresh_role() for role in ROLES}
    rank_counts = {horizon: {} for horizon in HORIZONS}
    for seed in range(seeds):
        group = play(names, roles, movie_count, seed=1000 + seed + (0 if pattern == "main" else 5000))
        rows, label_flips, tier_flips, other_flips, closes = path_for(group)
        for name in names:
            role = roles[name]
            bucket = by_role[role]
            bucket["label_flip"].append(label_flips[name] / closes)
            bucket["tier_flip"].append(tier_flips[name] / closes)
            bucket["other_flip"].append(other_flips[name] / closes)
            bucket["final"].append(rows[-1]["ranks"][name])
            for target in TARGETS:
                hit = first_absolute(rows, name, target)
                if hit is not None:
                    bucket["hits"][target].append(hit)
            for target in FALL_TARGETS:
                hit = first_absolute(rows, name, target, downward=True)
                if hit is not None:
                    bucket["falls"][target].append(hit)
            for chair in ("Challenger", "Grandmaster"):
                hit = first_label(rows, name, chair)
                if hit is not None:
                    bucket["chairs"][chair].append(hit)
            for horizon in HORIZONS:
                bucket["elo"][horizon].append(rows[horizon - 1]["elo"][name])
                label = rows[horizon - 1]["ranks"][name]
                rank_counts[horizon][label] = rank_counts[horizon].get(label, 0) + 1
    careers = {role: seeds * sum(1 for name in names if roles[name] == role) for role in ROLES}
    return by_role, rank_counts, careers


def median(values):
    if not values:
        return None
    return statistics.median(values)


def mean(values):
    if not values:
        return None
    return statistics.fmean(values)


def pct(values, q):
    ordered = sorted(values)
    if not ordered:
        return None
    index = min(len(ordered) - 1, max(0, round(q * (len(ordered) - 1))))
    return ordered[index]


def cell(hits, careers):
    """Median close. A minority result keeps the count. Nobody means a dash."""
    if not hits:
        return "–"
    shown = f"{median(hits):.0f}"
    if len(hits) * 2 < careers:
        return f"{shown} ({len(hits)}/{careers})"
    return shown


def shawshank():
    """Six members and one closed movie. Nothing has been played yet, so Elo stays 1500."""
    names = ["One", "Two", "Three", "Four", "Five", "Six"]
    group = Club()
    for name in names:
        group.apply({"type": "join", "user": name})
    group.apply({"type": "suggest", "user": "One", "movie": "The Shawshank Redemption"})
    for name in names:
        bucket = "a_lot" if name != "Four" else "kinda"
        group.apply(
            {"type": "rate", "user": name, "movie": "The Shawshank Redemption", "bucket": bucket, "answers": []}
        )
    league = group.league()
    picks = rated_picks(group, 1)
    matches = len(league.history[0].matches) if league.history else None
    return {
        "elo": league.elo,
        "ranks": assign_ranks(league.elo, picks),
        "picks": picks,
        "matches": matches,
    }


def write(main, competitive, shaw):
    by_role, rank_counts, careers = main
    comp_roles, comp_counts, comp_careers = competitive
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Rank ladder simulation",
        "",
        "Six members, one movie at a time. Elo is the UTR rebuild at the original step size, K=32 and d=2, and still starts at 1500.",
        "The faster step size, measured in a picker's own picks, is in VOLATILITY.md.",
        "The main club is one consistently good picker, four typical pickers, and one weak picker.",
        "A second club has two good pickers, so the #2 chair can actually be earned.",
        "About 12% of the others miss a movie, and 8% of comparison answers are flipped.",
        "40 seasons of 100 movies for the main club. 20 seasons for the two-good club.",
        "",
        "## Cutoffs",
        "",
        "1500 is the middle of Silver II. Cuts below Master are absolute. The top two chairs are relative.",
        f"A member steps up as soon as they cross a line, and steps down only after they are {DEMOTION_BUFFER} points below the line they are holding.",
        "",
        "| Rank | Requirement |",
        "|---|---|",
    ]
    for rank, requirement in cutoff_table():
        lines.append(f"| {rank} | {requirement} |")
    lines += [
        "",
        f"Challenger is only the current #1, and only at Elo {CHALLENGER_MIN_ELO} or higher with at least {CHALLENGER_MIN_PICKS} rated picks.",
        f"Grandmaster is only the current #2, and only while someone is Challenger, at Elo {GRANDMASTER_MIN_ELO} or higher with at least {GRANDMASTER_MIN_PICKS} rated picks.",
        "A rated pick is a movie they suggested that at least one other member scored. Ten picks is about 60 movies when six people take turns. If the leader is not there yet, both chairs stay empty. Second place does not inherit Challenger.",
        "",
        "## Elo after this many movies",
        "",
        "Mean, then the 10th / 50th / 90th percentile.",
        "",
        "| Movies | Good | Average | Bad |",
        "|---:|---|---|---|",
    ]
    for horizon in HORIZONS:
        def band(role, horizon=horizon):
            sample = by_role[role]["elo"][horizon]
            return f"{mean(sample):.0f} ({pct(sample, 0.1):.0f} / {pct(sample, 0.5):.0f} / {pct(sample, 0.9):.0f})"

        lines.append(f"| {horizon} | {band('good')} | {band('average')} | {band('bad')} |")
    lines += [
        "",
        "## Movies until a picker first reaches a tier",
        "",
        "Median close, from the start of the club, using the absolute cut. A count in parentheses means fewer than half of those careers ever got there. A dash means none did. Reaching Challenger does not count as reaching Master.",
        "",
        "| Tier | Good | Average | Bad |",
        "|---|---:|---:|---:|",
    ]
    for target in TARGETS:
        lines.append(
            "| {target} | {good} | {average} | {bad} |".format(
                target=target,
                good=cell(by_role["good"]["hits"][target], careers["good"]),
                average=cell(by_role["average"]["hits"][target], careers["average"]),
                bad=cell(by_role["bad"]["hits"][target], careers["bad"]),
            )
        )
    lines += [
        "",
        "Median close until a picker is first at that tier or lower:",
        "",
        "| Tier | Good | Average | Bad |",
        "|---|---:|---:|---:|",
    ]
    for target in FALL_TARGETS:
        lines.append(
            "| {target} | {good} | {average} | {bad} |".format(
                target=target,
                good=cell(by_role["good"]["falls"][target], careers["good"]),
                average=cell(by_role["average"]["falls"][target], careers["average"]),
                bad=cell(by_role["bad"]["falls"][target], careers["bad"]),
            )
        )
    lines += [
        "",
        "Share of careers that ever touched the tier:",
        "",
    ]
    for target in TARGETS:
        bits = ", ".join(
            f"{role} {len(by_role[role]['hits'][target])}/{careers[role]}" for role in ROLES
        )
        lines.append(f"- {target}: {bits}")
    lines += [
        "",
        "Top chairs in the main club. Median movie, among careers that reached the chair:",
        "",
    ]
    for role in ROLES:
        for chair in ("Grandmaster", "Challenger"):
            hits = by_role[role]["chairs"][chair]
            when = f"median movie {median(hits):.0f}" if hits else "never"
            lines.append(f"- {role} {chair}: {len(hits)}/{careers[role]}, {when}")
    lines += [
        "",
        "## How often the label changes",
        "",
        "Share of closes where the displayed rank changed. \"On someone else's movie\" is a change on a close they did not suggest.",
        "",
        "| Picker | Any change | Tier change | On someone else's movie |",
        "|---|---:|---:|---:|",
    ]
    for role, title in (("good", "Good"), ("average", "Average"), ("bad", "Bad")):
        lines.append(
            f"| {title} | {mean(by_role[role]['label_flip']):.0%} | {mean(by_role[role]['tier_flip']):.0%} | {mean(by_role[role]['other_flip']):.0%} |"
        )
    lines += [
        "",
        "## Where the main club is sitting",
        "",
    ]
    for horizon in (10, 30, 60, 100):
        ranked = sorted(rank_counts[horizon].items(), key=lambda item: -item[1])
        top = ", ".join(f"{label} {count}" for label, count in ranked[:8])
        lines.append(f"- After {horizon} movies: {top}")
    lines += [
        "",
        "## Two good pickers",
        "",
        "Same ladder. The good pickers split the wins, so each climbs a bit slower, and second place can be Grandmaster.",
        "",
        "| Chair | Good careers that reached it | Median movie |",
        "|---|---:|---:|",
    ]
    for chair in ("Grandmaster", "Challenger"):
        hits = comp_roles["good"]["chairs"][chair]
        shown = f"{median(hits):.0f}" if hits else "–"
        lines.append(f"| {chair} | {len(hits)}/{comp_careers['good']} | {shown} |")
    lines.append("")
    lines.append("Average and bad pickers holding a top chair in that club:")
    for role in ("average", "bad"):
        for chair in ("Grandmaster", "Challenger"):
            hits = comp_roles[role]["chairs"][chair]
            lines.append(f"- {role} {chair}: {len(hits)}/{comp_careers[role]}")
    lines += [
        "",
        "Good pickers' Elo in the two-good club (mean): "
        + ", ".join(f"{horizon} movies {mean(comp_roles['good']['elo'][horizon]):.0f}" for horizon in (20, 40, 60, 100))
        + ".",
        "",
        "## Shawshank, the only closed movie",
        "",
        "Six members, one movie, everyone rated it. The live score sheet is not in this repo. It does not matter for the board: the first movie has no earlier pick to play.",
        f"Matches played: {shaw['matches']}. Every Elo is {next(iter(shaw['elo'].values())):.0f}.",
        "Displayed ranks: " + ", ".join(f"{name} {shaw['ranks'][name]}" for name in shaw["ranks"]) + ".",
        f"The suggester has {shaw['picks']['One']} rated pick, which is under the minimum for either top chair.",
        "",
    ]
    (OUT / "ranks.md").write_text("\n".join(lines), encoding="utf-8")
    payload = {
        "cutoffs": cutoff_table(),
        "main": {
            "careers": careers,
            "elo_mean": {role: {str(h): mean(by_role[role]["elo"][h]) for h in HORIZONS} for role in ROLES},
            "elo_p10": {role: {str(h): pct(by_role[role]["elo"][h], 0.1) for h in HORIZONS} for role in ROLES},
            "elo_p50": {role: {str(h): pct(by_role[role]["elo"][h], 0.5) for h in HORIZONS} for role in ROLES},
            "elo_p90": {role: {str(h): pct(by_role[role]["elo"][h], 0.9) for h in HORIZONS} for role in ROLES},
            "median_first_hit": {
                role: {target: median(by_role[role]["hits"][target]) for target in TARGETS} for role in ROLES
            },
            "hit_count": {
                role: {target: len(by_role[role]["hits"][target]) for target in TARGETS} for role in ROLES
            },
            "fall_median": {
                role: {target: median(by_role[role]["falls"][target]) for target in FALL_TARGETS} for role in ROLES
            },
            "fall_count": {
                role: {target: len(by_role[role]["falls"][target]) for target in FALL_TARGETS} for role in ROLES
            },
            "flip": {
                role: {
                    "label": mean(by_role[role]["label_flip"]),
                    "tier": mean(by_role[role]["tier_flip"]),
                    "other_night": mean(by_role[role]["other_flip"]),
                }
                for role in ROLES
            },
            "chair_count": {
                role: {chair: len(by_role[role]["chairs"][chair]) for chair in ("Challenger", "Grandmaster")}
                for role in ROLES
            },
            "chair_median": {
                role: {chair: median(by_role[role]["chairs"][chair]) for chair in ("Challenger", "Grandmaster")}
                for role in ROLES
            },
        },
        "two_good": {
            "careers": comp_careers,
            "chair_count": {
                role: {chair: len(comp_roles[role]["chairs"][chair]) for chair in ("Challenger", "Grandmaster")}
                for role in ROLES
            },
            "chair_median": {
                role: {chair: median(comp_roles[role]["chairs"][chair]) for chair in ("Challenger", "Grandmaster")}
                for role in ROLES
            },
            "good_elo_mean": {str(h): mean(comp_roles["good"]["elo"][h]) for h in HORIZONS},
        },
        "shawshank": shaw,
        "rank_counts_main": {str(h): rank_counts[h] for h in rank_counts},
        "rank_counts_two_good": {str(h): comp_counts[h] for h in comp_counts},
    }
    (OUT / "ranks.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    main_result = summarize(40, 100, "main")
    competitive = summarize(20, 100, "two")
    shaw = shawshank()
    write(main_result, competitive, shaw)
    by_role, _counts, careers = main_result
    for role in ROLES:
        print(role, "careers", careers[role])
        print("  elo", {h: round(mean(by_role[role]["elo"][h])) for h in HORIZONS})
        print("  hits", {t: (median(by_role[role]["hits"][t]), len(by_role[role]["hits"][t])) for t in TARGETS})
        print(
            "  flip",
            round(mean(by_role[role]["label_flip"]), 3),
            round(mean(by_role[role]["tier_flip"]), 3),
            round(mean(by_role[role]["other_flip"]), 3),
        )
    print("shawshank", shaw["matches"], shaw["ranks"])


if __name__ == "__main__":
    main()
