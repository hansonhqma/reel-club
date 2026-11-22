import { randomBytes, timingSafeEqual } from "node:crypto"
import bcrypt from "bcryptjs"
import { hashSessionToken } from "@/lib/config"
import { getDb } from "@/lib/db"
import { AuthError } from "@/lib/errors"
import { appendRatingEvent } from "@/lib/rating-events"

export type UserRow = {
  id: number
  username: string
  name: string
  password_hash: string
  is_admin: number
  created_at: string
}

export type PublicUser = {
  id: number
  username: string
  name: string
  isAdmin: boolean
}

const SESSION_MS = 30 * 24 * 60 * 60 * 1000

export function toPublic(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    isAdmin: user.is_admin === 1,
  }
}

export function bcryptRounds(): number {
  const raw = Number(process.env.BCRYPT_ROUNDS ?? 12)
  if (!Number.isInteger(raw) || raw < 4 || raw > 15) return 12
  return raw
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, bcryptRounds())
}

export function getInviteCode(): string | null {
  const fromEnv = process.env.INVITE_CODE?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === "production") return null
  return "come-watch"
}

function inviteMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

export function validateUsername(raw: string): string {
  const username = raw.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) {
    throw new AuthError(
      "Usernames are 3–20 characters: a letter first, then letters, numbers, or underscores.",
      "bad_username",
    )
  }
  return username
}

export function validateName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > 40 || !/^[\p{L}][\p{L}\p{M}0-9 .'-]*$/u.test(name)) {
    throw new AuthError(
      "Use a name of 1–40 characters, starting with a letter.",
      "bad_name",
    )
  }
  return name
}

export function validatePassword(raw: string): string {
  if (raw.length < 8 || raw.length > 200) {
    throw new AuthError("Passwords need at least 8 characters.", "bad_password")
  }
  return raw
}

export function findUserByUsername(username: string): UserRow | null {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username.trim().toLowerCase()) as UserRow | undefined
  return row ?? null
}

export function findUserById(id: number): UserRow | null {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined
  return row ?? null
}

export function listUsers(): PublicUser[] {
  const rows = getDb()
    .prepare("SELECT * FROM users ORDER BY id ASC")
    .all() as UserRow[]
  return rows.map(toPublic)
}

function insertUser(
  input: {
    username: string
    name: string
    password: string
    isAdmin: boolean
  },
  meta: { via: "invite" | "admin" | "bootstrap"; actorId?: number },
): UserRow {
  const username = validateUsername(input.username)
  const name = validateName(input.name)
  const password = validatePassword(input.password)
  const now = new Date().toISOString()
  const db = getDb()
  try {
    return db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO users (username, name, password_hash, is_admin, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(username, name, hashPassword(password), input.isAdmin ? 1 : 0, now)
      const id = Number(info.lastInsertRowid)
      const created = findUserById(id)
      if (!created) throw new AuthError("Could not create that account.", "create_failed")
      appendRatingEvent(db, {
        actorId: meta.actorId ?? id,
        type: "member.joined",
        occurredAt: now,
        payload: { userId: id, username, name, isAdmin: input.isAdmin, via: meta.via },
      })
      return created
    })()
  } catch (error) {
    if (isUniqueViolation(error)) {
      const message = String((error as Error).message)
      if (message.includes("users.name")) {
        throw new AuthError("That name is already on the marquee.", "duplicate_name")
      }
      throw new AuthError("That username is taken.", "duplicate_username")
    }
    throw error
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  )
}

export function registerMember(input: {
  username: string
  name: string
  password: string
  inviteCode: string
}): PublicUser {
  const expected = getInviteCode()
  if (!expected) {
    throw new AuthError(
      "Joining with an invite code is turned off. Ask an admin to add you.",
      "invite_disabled",
    )
  }
  if (!inviteMatches(input.inviteCode.trim(), expected)) {
    throw new AuthError("That invite code isn't right.", "bad_invite")
  }
  const db = getDb()
  const create = db.transaction(() => {
    const count = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c
    return insertUser(
      {
        username: input.username,
        name: input.name,
        password: input.password,
        isAdmin: count === 0,
      },
      { via: "invite" },
    )
  })
  return toPublic(create.immediate())
}

export function ensureBootstrapAdmin(): void {
  const usernameRaw = process.env.ADMIN_USERNAME?.trim() ?? ""
  const password = process.env.ADMIN_PASSWORD ?? ""
  const nameRaw = process.env.ADMIN_NAME?.trim() ?? ""
  if (!usernameRaw && !password && !nameRaw) return
  if (!usernameRaw || !password) {
    throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD, or neither.")
  }
  const username = validateUsername(usernameRaw)
  if (findUserByUsername(username)) return
  const name = validateName(nameRaw || username)
  validatePassword(password)
  insertUser({ username, name, password, isAdmin: true }, { via: "bootstrap" })
}

export function createMember(
  input: {
    username: string
    name: string
    password: string
    isAdmin: boolean
  },
  actorId?: number,
): PublicUser {
  return toPublic(insertUser(input, { via: "admin", actorId }))
}

let dummyHash: { rounds: number; hash: string } | null = null

function dummyPasswordHash(): string {
  const rounds = bcryptRounds()
  if (!dummyHash || dummyHash.rounds !== rounds) {
    dummyHash = { rounds, hash: bcrypt.hashSync("not-a-user", rounds) }
  }
  return dummyHash.hash
}

export function authenticate(username: string, password: string): PublicUser {
  const user = findUserByUsername(username)
  const ok = bcrypt.compareSync(password, user?.password_hash ?? dummyPasswordHash())
  if (!user || !ok) {
    throw new AuthError("That username and password don't match.", "bad_login")
  }
  return toPublic(user)
}

function hashToken(token: string): string {
  return hashSessionToken(token)
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("base64url")
  const now = new Date()
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(hashToken(token), userId, new Date(now.getTime() + SESSION_MS).toISOString(), now.toISOString())
  return token
}

export function userFromToken(token: string | undefined | null): PublicUser | null {
  if (!token) return null
  const row = getDb()
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as UserRow | undefined
  return row ? toPublic(row) : null
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token))
}

export const SESSION_COOKIE = "reel_session"
