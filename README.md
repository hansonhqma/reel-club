# Reel Club

A private web app for a group of friends who run a movie club. Anyone can suggest a movie whenever they want. Everyone else scores it twice: how much they enjoyed watching it, and how good the movie actually is. Scored movies are replayed through [`movie_elo`](vendor/MOVIE_ELO_README.md), an Elo-style ranking of the members who pick.

## Ranking engine

`movie_elo` is a dependency-free Python library, not an HTTP service. This repo vendors it unchanged from [hansonhqma/elo-grouprating](https://github.com/hansonhqma/elo-grouprating) at commit `bef8ba41c5c1cf4c2946d826e4891c1e6a6b8aa7` (`movie-night-elo` 1.0.0):

- Package: `vendor/movie_elo`
- Upstream guide: `vendor/MOVIE_ELO_README.md`
- Upstream tests: `vendor/upstream_tests` (run by `npm test`)
- Adapter: `scripts/elo_bridge.py`

The app stores the member list and the raw rating log in SQLite. Standings are not stored. On each page that needs them, the Node server sends scored movies to the adapter, which calls `replay()`. Reports on the film page come from `format_week_report`. Nothing in this repository reimplements the match math. The library still calls each movie a "week"; the app no longer does.

The adapter reads JSON on stdin and writes JSON on stdout:

```json
{
  "members": ["Mira", "Jules"],
  "weeks": [
    {
      "week_id": "2026-10-02",
      "suggester": "Mira",
      "movie": "The Grand Budapest Hotel",
      "date": "2026-10-02",
      "ratings": { "Jules": { "experience": 8, "quality": 8 } }
    }
  ],
  "preview": null
}
```

`members` are the immutable names on the board, in join order. `weeks` are scored movies only. When a movie includes `ranked_at` (the time it first received a score, or the lock time of a movie migrated from the old weekly log), the adapter replays in that order rather than by `week_id`. Without `ranked_at`, the array order is the replay order. `preview` is still accepted by the adapter and is not used by the app. The response includes `standings`, `history` (each `WeekResult` plus the library's text report), `total_elo`, and `params`.

## Rules the app enforces

- Anyone can suggest a movie at any time. Several suggestions can be waiting at once. The person who suggests it is the suggester in `movie_elo`.
- Scores are 1–10 in half-point steps. The library accepts any real number in `[1, 10]`; the app is stricter so the buttons match the scale.
- The suggester cannot score their own movie. `movie_elo` raises `ValidationError` if they do.
- A member has one pair of scores per movie and can edit that pair at any time. Scores are visible once saved.
- A movie joins the ranking as soon as it has at least one score. Unscored suggestions stay on Unwatched / up next and are not replayed.
- Replay order is the time of the first score (`ranked_at`), then the movie id. Editing a score does not move the movie in that order. Movies migrated from the old weekly log keep their lock time, so an existing ranking stays in the order it was recorded.
- The suggester, or an admin, can remove a suggestion that has no scores. A scored movie stays in the log.
- The first scored movie does not move anyone. It starts defending the next one. 1500 stays the group average.
- Parameters stay at the library defaults (`k=32`, `d=2`, `w=400`, `alpha=0.5`, scale 1–10). Voter credit, provisional K, and pick expiry stay off.

## Local setup

You need Node.js 20+ and Python 3.9+ (`python3` on `PATH`).

```bash
npm install
npm test
SEED_DEMO=1 npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). `SEED_DEMO=1` fills an empty database with a demo club. Without it, the database stays empty and the first person who joins with the invite code becomes the admin.

| Username | Name | Password | Role |
| --- | --- | --- | --- |
| mira | Mira | `reel-night` | Admin |
| jules | Jules | `reel-night` | Member |
| theo | Theo | `reel-night` | Member |
| noor | Noor | `reel-night` | Member |
| sam | Sam | `reel-night` | Member |

The development invite code is `come-watch`. `npm run seed` fills an empty database the same way `SEED_DEMO=1` does.

Passwords are hashed with bcrypt. Session tokens are random. The database stores only an HMAC-SHA256 of each token, keyed with `SESSION_SECRET` (or a generated file next to the database in development). The cookie is httpOnly. No secret is committed. SQLite lives at `data/club.db` unless `DATA_DIR` or `CLUB_DB_PATH` is set.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `INVITE_CODE` | Code friends type to join. Required in production. Development default: `come-watch`. |
| `SESSION_SECRET` | At least 16 characters. Required in production. Signs session tokens. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Optional. On startup, creates this admin if that username does not exist yet. Does not reset the password later. |
| `ADMIN_NAME` | Board name for that admin. Defaults to `ADMIN_USERNAME`. |
| `SEED_DEMO` | `1` loads the demo club into an empty database. Anything else, including unset, does not. |
| `DATA_DIR` | Directory for `club.db`. Production default is `/data`. |
| `CLUB_DB_PATH` | Full path to the sqlite file. Overrides `DATA_DIR`. |
| `PORT` | HTTP port. Defaults to 43123 outside Railway. |
| `PYTHON` | Python executable. Default `python3`. |
| `BCRYPT_ROUNDS` | Cost factor, default 12. |

The first admin is created in one of two ways. Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` (and optionally `ADMIN_NAME`) before the first boot; that account is inserted once and later restarts leave the password alone. If those variables are unset and the database has no users, the first successful invite-code signup becomes the admin. Further signups are ordinary members. This build does not include a password-change screen.

## Tests

```bash
npm test
```

- `tests/auth.test.ts` covers invite checks, hashing, login, and sessions.
- `tests/ratings.test.ts` covers several suggestions at once, scoring out of suggestion order, edits that do not reshuffle replay, and a replay whose total Elo stays `1500 × members`.
- `tests/migrate.test.ts` upgrades a weekly SQLite file in place and checks that users, movies, and ratings survive.
- `tests/ranking.test.ts` and `tests/test_bridge.py` check the adapter against `movie_elo.replay` directly.
- `tests/beli.test.ts` and `tests/test_beli_bridge.py` cover the Beli pages' library code and adapter against `movie_beli` directly.
- `vendor/upstream_tests` is the library's own suite, including the README worked example, plus the `movie_beli` suite.

## Beli rankings

`/beli` is a second, independent ranking in the style of the Beli app. Members add movies and rank the other members' picks: pick a bucket (Liked, Fine, Didn't like), then answer a few "which did you like more?" questions that binary-search the movie into that bucket. Each member gets a sorted list with 0–10 scores derived from position, every movie gets a community score (mean of members' scores), and `/beli/leaderboard` ranks members by the average score their picks received. Nobody ranks their own pick.

The math is [`movie_beli`](vendor/UPSTREAM.md), vendored from `hansonhqma/elo-grouprating` (branch `feature/beli-rankings`), reached through `scripts/beli_bridge.py` the same way `movie_elo` is. SQLite holds the ordered lists in `beli_movies`, `beli_rankings` and `beli_pending` (one unfinished search per member, resumable). The Elo flow (`/movies`, `/leaderboard`, `club.ts`, `ranking.ts`, `elo_bridge.py`) is not involved and does not change.

## Deploying on Railway

The image is the `Dockerfile`. `railway.toml` selects the Dockerfile builder and sets the healthcheck to `/healthz`. Railway injects `PORT`; the server listens on `0.0.0.0:$PORT`.

Create a volume and mount it at `/data`. The database file is `/data/club.db`. The image sets `DATA_DIR=/data`. Do not leave the volume off, or every deploy starts from an empty club.

Service variables:

| Variable | Required | Example |
| --- | --- | --- |
| `INVITE_CODE` | yes | a long private phrase |
| `SESSION_SECRET` | yes | `openssl rand -base64 32` |
| `ADMIN_USERNAME` | recommended | `mira` |
| `ADMIN_PASSWORD` | recommended | 16+ random characters |
| `ADMIN_NAME` | no | `Mira` |
| `SEED_DEMO` | no | leave unset |

Do not set `SEED_DEMO` on the shared club. That loads the public demo password `reel-night`.

`/healthz` returns 200 when the config is present and SQLite answers. It returns 503 when `INVITE_CODE` or `SESSION_SECRET` is missing, so a deploy without those variables stays unhealthy instead of opening the club.

The session cookie is `Secure` in production, so the Railway domain needs HTTPS, which Railway provides.

A laptop Docker run uses the same image:

```bash
docker build -t reel-club .
docker run --rm -p 43123:43123 \
  -e INVITE_CODE='a-long-private-code' \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  -e ADMIN_USERNAME='mira' \
  -e ADMIN_PASSWORD='choose-a-real-password' \
  -e ADMIN_NAME='Mira' \
  -v reel-data:/data \
  reel-club
```

Without `PORT`, the container listens on 43123.

## Notes on the library

A few parts of the upstream guide describe a richer game than this app plays. They are left unused on purpose, not reimplemented:

- The guide's opening describes three candidate movies and a vote. This club suggests one movie. `voter_share` stays 0, so `candidates` and `votes` are never sent.
- Membership changes are not part of the movie log. The app replays the current member list from the beginning. Someone who joins later sits at 1500 for old movies and does not judge them, which matches `add_member` for a person with no past ratings. Removing a member is not supported: their name would still be inside old movies, and replay would raise `UnknownMemberError`.
- The upstream repo declares MIT in `pyproject.toml` and does not ship a LICENSE file.
