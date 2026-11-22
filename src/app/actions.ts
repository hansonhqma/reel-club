"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { authenticate, createMember, createSession, registerMember } from "@/lib/auth"
import { removeSuggestion, submitRating, suggestMovie } from "@/lib/club"
import { AuthError, ClubError } from "@/lib/errors"
import { clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/session"

export type ActionState = { error?: string; ok?: boolean } | null

function refresh() {
  revalidatePath("/", "layout")
}

function message(error: unknown): string {
  if (error instanceof AuthError || error instanceof ClubError) return error.message
  throw error
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = authenticate(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""))
    await setSessionCookie(createSession(user.id))
  } catch (error) {
    return { error: message(error) }
  }
  redirect("/movies")
}

export async function joinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = registerMember({
      username: String(formData.get("username") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
      inviteCode: String(formData.get("invite") ?? ""),
    })
    await setSessionCookie(createSession(user.id))
  } catch (error) {
    return { error: message(error) }
  }
  redirect("/movies")
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie()
  redirect("/")
}

export async function suggestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "You need to log in again." }
  try {
    suggestMovie(user.id, String(formData.get("movie") ?? ""), String(formData.get("note") ?? ""))
  } catch (error) {
    return { error: message(error) }
  }
  refresh()
  redirect("/movies")
}

export async function rateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "You need to log in again." }
  try {
    submitRating(user.id, formData.get("movieId"), formData.get("experience"), formData.get("quality"))
  } catch (error) {
    return { error: message(error) }
  }
  refresh()
  return { ok: true }
}

export async function removeSuggestionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const movieId = String(formData.get("movieId") ?? "")
  try {
    removeSuggestion(user.id, movieId)
  } catch (error) {
    if (error instanceof ClubError || error instanceof AuthError) {
      redirect(`/movies/${movieId}?error=${encodeURIComponent(error.message)}`)
    }
    throw error
  }
  refresh()
  redirect("/movies")
}

export async function createMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user?.isAdmin) return { error: "Only an admin can add members." }
  let createdName = ""
  try {
    createdName = createMember(
      {
        username: String(formData.get("username") ?? ""),
        name: String(formData.get("name") ?? ""),
        password: String(formData.get("password") ?? ""),
        isAdmin: formData.get("isAdmin") === "on",
      },
      user.id,
    ).name
  } catch (error) {
    return { error: message(error) }
  }
  refresh()
  redirect(`/admin?added=${encodeURIComponent(createdName)}`)
}
