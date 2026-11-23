import type Database from "better-sqlite3"
import { computeLeague, type WeekInput } from "@/lib/ranking"
import { UTR_BUCKETS, bandScore, type UtrBucket } from "@/lib/utr-score"

// Spicy tuning. d = 1.25 makes a 1.25-point list gap about a 91% win.
// K = 160 / (n - 1). n is the Elo roster: everyone who has joined, including
// anyone who has left. Leaving does not shrink it. Six people gives K = 32.
// A roster of one has no match to play, so K stays at the engine default.
export const UTR_SCORE_GAP = 1.25
export const UTR_K_NUMERATOR = 160

export function utrEloParams(rosterSize: number): { k: number; d: number; scale_min: number; scale_max: number } {
  const opponents = rosterSize - 1
  return {
    k: opponents >= 1 ? UTR_K_NUMERATOR / opponents : 32,
    d: UTR_SCORE_GAP,
    scale_min: 0,
    scale_max: 10,
  }
}

export type Member = { id: number; name: string }
export type Movie = { id: number; title: string; suggesterId: number; seq: number }

export type EloMap = Record<number, number>

function membersOf(db: Database.Database): Member[] {
  return db
    .prepare(
      `SELECT utr_members.user_id AS id, users.name AS name
       FROM utr_members
       JOIN users ON users.id = utr_members.user_id
       ORDER BY utr_members.user_id ASC`,
    )
    .all() as Member[]
}

function listScores(db: Database.Database): Map<number, Map<number, number>> {
  const rows = db
    .prepare(
      `SELECT user_id, movie_id, bucket, position
       FROM utr_lists
       ORDER BY user_id ASC, bucket ASC, position ASC`,
    )
    .all() as { user_id: number; movie_id: number; bucket: UtrBucket; position: number }[]
  const grouped = new Map<number, Record<UtrBucket, number[]>>()
  for (const row of rows) {
    let lists = grouped.get(row.user_id)
    if (!lists) {
      lists = { a_lot: [], kinda: [], not_really: [] }
      grouped.set(row.user_id, lists)
    }
    lists[row.bucket].push(row.movie_id)
  }
  const scores = new Map<number, Map<number, number>>()
  for (const [userId, lists] of grouped) {
    const mine = new Map<number, number>()
    for (const bucket of UTR_BUCKETS) {
      lists[bucket].forEach((movieId, position) => {
        mine.set(movieId, bandScore(bucket, position, lists[bucket].length))
      })
    }
    scores.set(userId, mine)
  }
  return scores
}

function weeksFor(movies: Movie[], scores: Map<number, Map<number, number>>, members: Member[]): WeekInput[] {
  const nameById = new Map(members.map((member) => [member.id, member.name]))
  const weeks: WeekInput[] = []
  for (const movie of movies) {
    const ratings: Record<string, { experience: number; quality: number }> = {}
    for (const member of members) {
      if (member.id === movie.suggesterId) continue
      const value = scores.get(member.id)?.get(movie.id)
      if (value == null) continue
      ratings[member.name] = { experience: value, quality: value }
    }
    if (Object.keys(ratings).length === 0) continue
    weeks.push({
      week_id: String(movie.id),
      suggester: nameById.get(movie.suggesterId) ?? "",
      movie: movie.title,
      ratings,
    })
  }
  return weeks
}

export function eloForWeeks(members: Member[], weeks: WeekInput[]): EloMap {
  const base = Object.fromEntries(members.map((member) => [member.id, 1500])) as EloMap
  if (weeks.length === 0) return base
  const league = computeLeague({
    members: members.map((member) => member.name),
    weeks,
    params: utrEloParams(members.length),
  })
  const idByName = new Map(members.map((member) => [member.name, member.id]))
  for (const row of league.standings) {
    const id = idByName.get(row.member)
    if (id != null) base[id] = row.elo
  }
  return base
}

function reviveElo(json: string): EloMap {
  const raw = JSON.parse(json) as Record<string, number>
  const out: EloMap = {}
  for (const [key, value] of Object.entries(raw)) out[Number(key)] = value
  return out
}

function subtract(later: EloMap, earlier: EloMap, members: Member[]): EloMap {
  const out: EloMap = {}
  for (const member of members) {
    out[member.id] = (later[member.id] ?? 1500) - (earlier[member.id] ?? 1500)
  }
  return out
}

export function nextClose(
  members: Member[],
  earlier: Movie[],
  movie: Movie,
  scores: Map<number, Map<number, number>>,
  previous: EloMap | null,
): { elo: EloMap; fromNew: EloMap; fromOlder: EloMap } {
  const before = previous ?? (Object.fromEntries(members.map((member) => [member.id, 1500])) as EloMap)
  const reshuffled = eloForWeeks(members, weeksFor(earlier, scores, members))
  const now = eloForWeeks(members, weeksFor([...earlier, movie], scores, members))
  return { elo: now, fromOlder: subtract(reshuffled, before, members), fromNew: subtract(now, reshuffled, members) }
}

// Fill utr_closes for closed movies that do not have a snapshot yet.
// Older snapshots stay put. A new close uses today's list scores for every movie.
export function recordUtrCloses(db: Database.Database): void {
  const members = membersOf(db)
  const closed = db
    .prepare(
      `SELECT id, title, suggester_id AS suggesterId, seq
       FROM utr_movies
       WHERE status = 'closed' AND seq IS NOT NULL
       ORDER BY seq ASC, id ASC`,
    )
    .all() as Movie[]
  const have = new Set(
    (db.prepare("SELECT movie_id FROM utr_closes").all() as { movie_id: number }[]).map((row) => row.movie_id),
  )
  const scores = listScores(db)
  let previous: EloMap | null = null
  const last = db
    .prepare(
      `SELECT elo_json FROM utr_closes
       JOIN utr_movies ON utr_movies.id = utr_closes.movie_id
       ORDER BY utr_movies.seq DESC LIMIT 1`,
    )
    .get() as { elo_json: string } | undefined
  if (last) previous = reviveElo(last.elo_json)

  const insert = db.prepare(
    `INSERT INTO utr_closes (movie_id, seq, scores_json, elo_json, from_new_json, from_older_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const seen: Movie[] = []
  for (const movie of closed) {
    if (have.has(movie.id)) {
      seen.push(movie)
      continue
    }
    const closedNow = nextClose(members, seen, movie, scores, previous)
    const { elo: now, fromNew, fromOlder } = closedNow
    const scoreObject: Record<string, Record<string, number>> = {}
    for (const [userId, mine] of scores) {
      scoreObject[String(userId)] = Object.fromEntries(mine)
    }
    insert.run(movie.id, movie.seq, JSON.stringify(scoreObject), JSON.stringify(now), JSON.stringify(fromNew), JSON.stringify(fromOlder))
    previous = now
    seen.push(movie)
  }
}
