import { hashPassword } from "@/lib/auth"
import { findUserByUsername } from "@/lib/auth"
import { getRatings, listMovies, submitRating, suggestMovie } from "@/lib/club"
import { getDb } from "@/lib/db"
import { appendRatingEvent } from "@/lib/rating-events"

export const DEMO_PASSWORD = "reel-night"

const PEOPLE = [
  { username: "mira", name: "Mira", isAdmin: true },
  { username: "jules", name: "Jules", isAdmin: false },
  { username: "theo", name: "Theo", isAdmin: false },
  { username: "noor", name: "Noor", isAdmin: false },
  { username: "sam", name: "Sam", isAdmin: false },
] as const

type ScoreMap = Record<string, [number, number]>

const MOVIES: {
  suggester: string
  movie: string
  note: string
  at: string
  ratings: ScoreMap
}[] = [
  {
    suggester: "mira",
    movie: "The Grand Budapest Hotel",
    note: "Wes at his most pastry-shop. Mira has wanted this on the list since the club started.",
    at: "2026-10-02T18:00:00.000Z",
    ratings: { jules: [8, 8], theo: [7, 8], noor: [9, 9], sam: [6, 7] },
  },
  {
    suggester: "jules",
    movie: "Parasite",
    note: "Jules has been campaigning for this since 2019 and refused to summarize the plot.",
    at: "2026-10-09T18:00:00.000Z",
    ratings: { mira: [9, 10], theo: [8, 9], noor: [9, 9], sam: [8, 8] },
  },
  {
    suggester: "theo",
    movie: "Before Sunrise",
    note: "Talky, on purpose. Theo said to treat the walking as the plot.",
    at: "2026-10-16T18:00:00.000Z",
    ratings: { mira: [8, 6], jules: [7, 6], noor: [9, 7], sam: [5, 5] },
  },
  {
    suggester: "noor",
    movie: "Spirited Away",
    note: "Noor's comfort pick, defended in the group chat as canon rather than nostalgia.",
    at: "2026-10-23T18:00:00.000Z",
    ratings: { mira: [9, 9], jules: [8, 9], theo: [10, 9], sam: [8, 8] },
  },
  {
    suggester: "sam",
    movie: "The Nice Guys",
    note: "Sam promised it was fun and not homework. There was popcorn. There were arguments.",
    at: "2026-10-30T18:00:00.000Z",
    ratings: { mira: [7, 6], jules: [8, 6], theo: [6, 5], noor: [7, 6] },
  },
  {
    suggester: "mira",
    movie: "Paddington 2",
    note: "Mira says this is a perfect film and is willing to be ranked on it.",
    at: "2026-11-06T18:00:00.000Z",
    ratings: { jules: [9, 8], theo: [8, 8], noor: [9, 8], sam: [8, 7] },
  },
  {
    suggester: "jules",
    movie: "Portrait of a Lady on Fire",
    note: "Jules again. Bring tissues, apparently. Not everyone has scored it yet.",
    at: "2026-11-13T18:00:00.000Z",
    ratings: { theo: [9, 9], noor: [8, 9] },
  },
  {
    suggester: "sam",
    movie: "In the Mood for Love",
    note: "Sam put this on the list for whenever the group can sit still for it.",
    at: "2026-11-20T18:00:00.000Z",
    ratings: {},
  },
]

function userId(username: string): number {
  const user = findUserByUsername(username)
  if (!user) throw new Error(`Missing demo user ${username}`)
  return user.id
}

export function seedDemo(): void {
  const db = getDb()
  const existing = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
  if (existing.c > 0) {
    throw new Error("Refusing to seed a database that already has members.")
  }
  const passwordHash = hashPassword(DEMO_PASSWORD)
  const insert = db.prepare(
    `INSERT INTO users (username, name, password_hash, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const createdAt = "2026-09-20T16:00:00.000Z"
  const addMembers = db.transaction(() => {
    for (const person of PEOPLE) {
      const info = insert.run(person.username, person.name, passwordHash, person.isAdmin ? 1 : 0, createdAt)
      const id = Number(info.lastInsertRowid)
      appendRatingEvent(db, {
        actorId: id,
        type: "member.joined",
        occurredAt: createdAt,
        payload: {
          userId: id,
          username: person.username,
          name: person.name,
          isAdmin: person.isAdmin,
          via: "seed",
        },
      })
    }
  })
  addMembers()

  for (const entry of MOVIES) {
    const movie = suggestMovie(userId(entry.suggester), entry.movie, entry.note, { suggestedAt: entry.at })
    let index = 0
    for (const [username, scores] of Object.entries(entry.ratings)) {
      const at = `${entry.at.slice(0, 10)}T${String(20 + index).padStart(2, "0")}:15:00.000Z`
      submitRating(userId(username), movie.id, scores[0], scores[1], { at })
      index += 1
    }
  }
}

export function seedDemoIfEmpty(): boolean {
  const existing = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }
  if (existing.c > 0) return false
  seedDemo()
  return true
}

export function demoClubIsSeeded(): boolean {
  return (
    findUserByUsername("mira") !== null &&
    listMovies().some((movie) => movie.movie === "Portrait of a Lady on Fire" && movie.ratingCount > 0) &&
    getRatings(listMovies().find((movie) => movie.movie === "In the Mood for Love")?.id ?? 0).length === 0
  )
}
