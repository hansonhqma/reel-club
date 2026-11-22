"""Synthetic clubs for the UTR prototype.

Run from the repo root:

    python prototype/utr/simulate.py

Writes prototype/utr/results/.
"""

from __future__ import annotations

import json
import math
import random
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "vendor"))

from movie_elo import Params, Week, replay

from prototype.utr.utr import Club

OUT = Path(__file__).resolve().parent / "results"
MAPPINGS = ("beli", "clamp", "baseline", "rank")


def kendall(left, right):
    """Correlation of two score maps. Higher means the same people or movies rank together."""
    names = sorted(set(left) & set(right))
    count = len(names)
    if count < 2:
        return None
    agree = disagree = 0
    for i in range(count):
        for j in range(i + 1, count):
            a, b = names[i], names[j]
            sign = (left[a] - left[b]) * (right[a] - right[b])
            if sign > 0:
                agree += 1
            elif sign < 0:
                disagree += 1
    return (agree - disagree) / (count * (count - 1) / 2)


def rmse(left, right, names):
    return math.sqrt(sum((left[name] - right[name]) ** 2 for name in names) / len(names))


def bucket_for(utility):
    if utility < -0.35:
        return "not_really"
    if utility < 0.75:
        return "kinda"
    return "a_lot"


def to_ten(value):
    scaled = (value + 2.5) / 5.0 * 9.0 + 1.0
    scaled = min(10.0, max(1.0, scaled))
    return round(scaled * 2) / 2


def draw_world(users, movies, seed):
    rng = random.Random(seed)
    quality = {movie: rng.gauss(0, 1) for movie in movies}
    enjoyment = {}
    for user in users:
        bias = rng.gauss(0, 0.35)
        enjoyment[user] = {
            movie: quality[movie] + bias + rng.gauss(0, 0.55) for movie in movies
        }
    return quality, enjoyment


def answers_for(taste, movie, bucket, enjoyment, user, rng, flip):
    search = taste.start(movie, bucket)
    answers = []
    while not search.done:
        pivot = search.pivot
        prefer_new = enjoyment[user][movie] > enjoyment[user][pivot]
        if rng.random() < flip:
            prefer_new = not prefer_new
        answers.append("new" if prefer_new else "old")
        search = search.answer(answers[-1])
    return answers


def attendance(users, movies, suggesters, seed, skip):
    """Who watched, decided per person and movie so a shuffle does not change it."""
    present = {}
    for movie in movies:
        here = {suggesters[movie]}
        for user in users:
            if user == suggesters[movie]:
                continue
            draw = random.Random(f"{seed}:{user}:{movie}").random()
            if draw >= skip:
                here.add(user)
        present[movie] = here
    return present


def play_utr(users, movies, enjoyment, seed, flip, present, suggesters):
    """Play every movie to close. Elo, when asked, uses the lists as they stand then."""
    group = Club()
    for user in users:
        group.apply({"type": "join", "user": user})
    questions = []
    for movie in movies:
        suggester = suggesters[movie]
        group.apply({"type": "suggest", "user": suggester, "movie": movie})
        for user in users:
            if user not in present[movie]:
                group.apply({"type": "skip", "user": user, "movie": movie})
                continue
            bucket = bucket_for(enjoyment[user][movie])
            rng = random.Random(f"{seed}:answer:{user}:{movie}")
            answers = answers_for(group.tastes[user], movie, bucket, enjoyment, user, rng, flip)
            questions.append(len(answers))
            group.apply(
                {
                    "type": "rate",
                    "user": user,
                    "movie": movie,
                    "bucket": bucket,
                    "answers": answers,
                }
            )
    return group, questions


def elo_of(group, mapping):
    return group.league(mapping).elo


def current_elo(users, movies, enjoyment, quality, seed, present, suggesters):
    """Today's system: two noisy 1–10 scores, fixed once written. Suggester sits out."""
    weeks = []
    for movie in movies:
        ratings = {}
        for user in users:
            if user == suggesters[movie] or user not in present[movie]:
                continue
            rng = random.Random(f"{seed}:scores:{user}:{movie}")
            enjoy = to_ten(enjoyment[user][movie] + rng.gauss(0, 0.25))
            film = to_ten(quality[movie] + rng.gauss(0, 0.35))
            ratings[user] = (enjoy, film)
        if not ratings:
            continue
        weeks.append(Week(movie, suggesters[movie], movie, ratings))
    return replay(users, weeks, Params()).elo


def true_strength(users, movies, enjoyment, suggesters, watched):
    totals = {user: [] for user in users}
    for movie in movies:
        owner = suggesters[movie]
        for user in users:
            if user == owner or user not in watched[movie]:
                continue
            totals[owner].append(enjoyment[user][movie])
    return {user: statistics.fmean(scores) if scores else 0.0 for user, scores in totals.items()}


def part_rmse(change, key):
    values = list(change[key].values())
    return math.sqrt(sum(value * value for value in values) / len(values))


def mean_part(changes, key):
    return statistics.fmean(part_rmse(change, key) for change in changes)


def example_line(changes):
    """The member-close where older scores moved the board the most."""
    best = None
    for change in changes:
        for member, older in change["from_older_scores"].items():
            if best is None or abs(older) > abs(best["older"]):
                best = {
                    "movie": change["movie"],
                    "member": member,
                    "older": older,
                    "new": change["from_new_movie"][member],
                    "total": change["total"][member],
                }
    return best


def run_scenario(label, users, movie_count, seed, flip, skip):
    movies = [f"M{index:02d}" for index in range(movie_count)]
    quality, enjoyment = draw_world(users, movies, seed)
    suggesters = {movie: users[index % len(users)] for index, movie in enumerate(movies)}
    present = attendance(users, movies, suggesters, seed + 3, skip)
    group, questions = play_utr(users, movies, enjoyment, seed + 1, flip, present, suggesters)
    watched = {movie: set(present[movie]) for movie in movies}
    strength = true_strength(users, movies, enjoyment, suggesters, watched)
    order_tau = []
    for user in users:
        truth = enjoyment[user]
        # Higher utility should match an earlier list position.
        predicted = {
            movie: len(group.tastes[user].movies()) - index
            for index, movie in enumerate(group.tastes[user].movies())
        }
        order_tau.append(kendall(truth, predicted))

    by_mapping = {}
    for mapping in MAPPINGS:
        elo = elo_of(group, mapping)
        by_mapping[mapping] = {
            "tau_vs_strength": kendall(elo, strength),
            "elo_spread": statistics.pstdev(elo.values()),
            "leader": max(elo, key=elo.get),
        }
    revised = elo_of(group, "beli")
    current = current_elo(users, movies, enjoyment, quality, seed + 1, present, suggesters)

    # Change at close t is the full rebuild at t minus the full rebuild at t-1.
    # It splits into the new movie's matches and older scores re-sorted since t-1.
    changes = [group.close_change(index) for index in range(len(group.closed))]

    return {
        "label": label,
        "users": len(users),
        "movies": movie_count,
        "flip": flip,
        "skip": skip,
        "questions_mean": statistics.fmean(questions),
        "questions_p95": sorted(questions)[max(0, math.ceil(0.95 * len(questions)) - 1)],
        "questions_max": max(questions),
        "questions_zero_share": questions.count(0) / len(questions),
        "order_tau": statistics.fmean(tau for tau in order_tau if tau is not None),
        "step_rmse": mean_part(changes, "total"),
        "new_rmse": mean_part(changes, "from_new_movie"),
        "older_rmse": mean_part(changes, "from_older_scores"),
        "new_series": [part_rmse(change, "from_new_movie") for change in changes],
        "older_series": [part_rmse(change, "from_older_scores") for change in changes],
        "example": example_line(changes),
        "mappings": by_mapping,
        "current_tau": kendall(current, strength),
        "current_spread": statistics.pstdev(current.values()),
        "utr_vs_current_tau": kendall(revised, current),
    }


def order_effect(users, movie_count, seed, flip, skip, shuffles):
    movies = [f"M{index:02d}" for index in range(movie_count)]
    _quality, enjoyment = draw_world(users, movies, seed)
    suggesters = {movie: users[index % len(users)] for index, movie in enumerate(movies)}
    present = attendance(users, movies, suggesters, seed + 3, skip)
    base, _ = play_utr(users, movies, enjoyment, seed + 1, flip, present, suggesters)
    base_elo = base.league("beli").elo
    rng = random.Random(seed + 99)
    taus = []
    rmses = []
    for _ in range(shuffles):
        order = movies[:]
        rng.shuffle(order)
        alt, _ = play_utr(users, order, enjoyment, seed + 1, flip, present, suggesters)
        elo = alt.league("beli").elo
        taus.append(kendall(base_elo, elo))
        rmses.append(rmse(base_elo, elo, users))
    return {
        "tau_mean": statistics.fmean(taus),
        "tau_min": min(taus),
        "rmse_mean": statistics.fmean(rmses),
        "rmse_max": max(rmses),
    }


def svg_parts(new_series, older_series):
    width, height = 720, 280
    pad = 36
    peak = max(new_series + older_series + [1])

    def points(series):
        coords = []
        last = max(1, len(series) - 1)
        for index, value in enumerate(series):
            x = pad + index / last * (width - 2 * pad)
            y = height - pad - value / peak * (height - 2 * pad)
            coords.append(f"{x:.1f},{y:.1f}")
        return " ".join(coords)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">
  <text x="{pad}" y="22" font-family="sans-serif" font-size="14">Where an Elo change comes from when a movie closes</text>
  <text x="{pad}" y="{height - 8}" font-family="sans-serif" font-size="12" fill="#555">movies, in the order they closed</text>
  <polyline fill="none" stroke="#7a2e32" stroke-width="2.5" points="{points(new_series)}"/>
  <polyline fill="none" stroke="#1f6b5a" stroke-width="2.5" points="{points(older_series)}"/>
  <text x="{pad}" y="44" font-family="sans-serif" font-size="12" fill="#7a2e32">from the new movie</text>
  <text x="{pad + 150}" y="44" font-family="sans-serif" font-size="12" fill="#1f6b5a">from older ratings being re-sorted</text>
</svg>
"""


def fmt(value, digits=2):
    if value is None:
        return "–"
    return f"{value:.{digits}f}"


def signed(value):
    text = f"{value:+.1f}"
    if text == "-0.0" or text == "+0.0":
        return "+0.0"
    return text


def write_report(scenarios, orders, primary):
    OUT.mkdir(parents=True, exist_ok=True)
    lines = [
        "# UTR simulation results",
        "",
        "Synthetic clubs. Each person has a hidden enjoyment for every movie.",
        "They answer the enjoyment question from that number, then answer the",
        "comparisons with occasional mistakes (`flip` is the chance a comparison is backwards).",
        "About 15% of non-suggesters do not watch a given movie.",
        "Closed ratings are never edited.",
        "",
        "## Questions and recovery of taste",
        "",
        "| Club | Movies | Mistakes | Questions, average | 95th percentile | Max | Share with no comparison | Taste agreement |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in scenarios:
        lines.append(
            f"| {row['label']} | {row['movies']} | {row['flip']:.0%} | {fmt(row['questions_mean'])} | "
            f"{row['questions_p95']} | {row['questions_max']} | {row['questions_zero_share']:.0%} | {fmt(row['order_tau'])} |"
        )
    lines += [
        "",
        "Taste agreement is 1 when a person's list is in the same order as their hidden enjoyment, and 0 when the list is no better than chance. With no deliberate mistakes the lists matched exactly in this draw. A bucket boundary can still swap two movies whose enjoyment is almost the same; that simply did not happen here.",
        "",
        "## Does the Elo board track who picks well?",
        "",
        "The hidden target is the average enjoyment other people had for the movies that person suggested.",
        "Agreement is between that target and the final Elo order.",
        "",
        "| Club | Beli bands | Clamped at 1 | Bucket middle only | Whole-list 1–10 | Today's two scores |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in scenarios:
        maps = row["mappings"]
        lines.append(
            f"| {row['label']} | {fmt(maps['beli']['tau_vs_strength'])} | {fmt(maps['clamp']['tau_vs_strength'])} | "
            f"{fmt(maps['baseline']['tau_vs_strength'])} | {fmt(maps['rank']['tau_vs_strength'])} | {fmt(row['current_tau'])} |"
        )
    lines += [
        "",
        "Spread of Elo around 1500 (standard deviation), same clubs:",
        "",
        "| Club | Beli bands | Bucket middle only | Whole-list 1–10 | Today's two scores |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in scenarios:
        maps = row["mappings"]
        lines.append(
            f"| {row['label']} | {fmt(maps['beli']['elo_spread'], 1)} | {fmt(maps['baseline']['elo_spread'], 1)} | "
            f"{fmt(maps['rank']['elo_spread'], 1)} | {fmt(row['current_spread'], 1)} |"
        )
    lines += [
        "",
        "## How far the board moves when a movie closes",
        "",
        "A member's change is their Elo after the full rebuild at this close, minus their Elo after the full rebuild at the previous close.",
        "That change splits in two. **New movie** is the matches the movie just closed plays.",
        "**Older ratings** is what happens when the earlier movies are replayed with the lists as they stand now.",
        "For each person the two parts add up to the change. The table is the typical size of each part across the club (root-mean-square Elo points).",
        "",
        "| Club | Total | From the new movie | From older ratings being re-sorted |",
        "|---|---:|---:|---:|",
    ]
    for row in scenarios:
        lines.append(
            f"| {row['label']} | {fmt(row['step_rmse'], 1)} | {fmt(row['new_rmse'], 1)} | {fmt(row['older_rmse'], 1)} |"
        )
    example = primary["example"]
    lines += [
        "",
        (
            f"The biggest re-sort for one person in the 6-person club was when {example['movie']} closed, for {example['member']}: "
            f"{signed(example['new'])} from the new movie, {signed(example['older'])} from older ratings being re-sorted."
        ),
        "",
        "## Order",
        "",
        "Same hidden tastes, same suggesters, movies played in a shuffled order.",
        "",
        "| Comparison | Agreement of final Elo with the original order | Typical Elo distance | Largest Elo distance |",
        "|---|---:|---:|---:|",
        f"| {orders['movies']} movies, {orders['shuffles']} shuffles, {orders['flip']:.0%} mistakes | {fmt(orders['tau_mean'])} (lowest {fmt(orders['tau_min'])}) | {fmt(orders['rmse_mean'], 1)} | {fmt(orders['rmse_max'], 1)} |",
        "",
        "Agreement of 1 would mean the shuffle never changed who finished above whom.",
        "",
        "## Reading the picture",
        "",
        "`stability.svg` is the 6-person, 40-movie club with 8% mistaken comparisons.",
        "The dark line is the new movie's matches. The green line is older ratings being re-sorted.",
        "A higher point means that part moved the club more when that movie closed.",
        "",
    ]
    (OUT / "RESULTS.md").write_text("\n".join(lines), encoding="utf-8")
    (OUT / "stability.svg").write_text(
        svg_parts(primary["new_series"], primary["older_series"]),
        encoding="utf-8",
    )
    slim = []
    for row in scenarios:
        item = {key: value for key, value in row.items() if key not in {"new_series", "older_series"}}
        slim.append(item)
    (OUT / "summary.json").write_text(json.dumps({"scenarios": slim, "order": orders}, indent=2), encoding="utf-8")


def main():
    specs = [
        ("5 people, careful answers", 5, 30, 11, 0.0, 0.15),
        ("5 people, 10% mistakes", 5, 30, 11, 0.10, 0.15),
        ("6 people, 40 movies", 6, 40, 21, 0.08, 0.15),
        ("5 people, 60 movies", 5, 60, 31, 0.08, 0.15),
    ]
    scenarios = []
    primary = None
    for label, count, movies, seed, flip, skip in specs:
        users = [f"U{index}" for index in range(count)]
        row = run_scenario(label, users, movies, seed, flip, skip)
        scenarios.append(row)
        if label.startswith("6 people"):
            primary = row
        print(
            f"{label}: questions {row['questions_mean']:.2f}, taste {row['order_tau']:.2f}, "
            f"beli tau {row['mappings']['beli']['tau_vs_strength']:.2f}, "
            f"current tau {row['current_tau']:.2f}, "
            f"change {row['step_rmse']:.1f} (new {row['new_rmse']:.1f}, older {row['older_rmse']:.1f})"
        )
    users = [f"U{index}" for index in range(6)]
    orders = order_effect(users, 30, 21, 0.08, 0.15, 12)
    orders["movies"] = 30
    orders["shuffles"] = 12
    orders["flip"] = 0.08
    print(
        f"order: tau {orders['tau_mean']:.2f} (min {orders['tau_min']:.2f}), "
        f"rmse {orders['rmse_mean']:.1f}"
    )
    write_report(scenarios, orders, primary)


if __name__ == "__main__":
    main()
