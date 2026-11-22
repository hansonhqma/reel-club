"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { UtrError, answerUtrRating, closeUtrMovie, restartUtrRating, skipUtrMovie, startUtrRating, suggestUtrMovie } from "@/lib/utr"
import { getCurrentUser } from "@/lib/session"

export type UtrActionState = { error?: string } | null

function fail(error: unknown): UtrActionState {
  if (error instanceof UtrError) return { error: error.message }
  throw error
}

export async function suggestUtrAction(_prev: UtrActionState, formData: FormData): Promise<UtrActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "You need to log in again." }
  try {
    suggestUtrMovie(user.id, String(formData.get("title") ?? ""))
  } catch (error) {
    return fail(error)
  }
  revalidatePath("/utr")
  redirect("/utr")
}

export async function startUtrAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  try {
    startUtrRating(user.id, Number(formData.get("movieId")), String(formData.get("bucket") ?? ""))
  } catch (error) {
    if (error instanceof UtrError) redirect(`/utr?error=${encodeURIComponent(error.message)}`)
    throw error
  }
  revalidatePath("/utr")
  redirect("/utr")
}

export async function answerUtrAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const history = Number(formData.get("history"))
  try {
    answerUtrRating(user.id, Number(formData.get("movieId")), String(formData.get("answer") ?? ""), history)
  } catch (error) {
    if (error instanceof UtrError) redirect(`/utr?error=${encodeURIComponent(error.message)}`)
    throw error
  }
  revalidatePath("/utr")
  redirect("/utr")
}

export async function restartUtrAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  try {
    restartUtrRating(user.id, Number(formData.get("movieId")))
  } catch (error) {
    if (error instanceof UtrError) redirect(`/utr?error=${encodeURIComponent(error.message)}`)
    throw error
  }
  revalidatePath("/utr")
  redirect("/utr")
}

export async function skipUtrAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  try {
    skipUtrMovie(user.id, Number(formData.get("movieId")))
  } catch (error) {
    if (error instanceof UtrError) redirect(`/utr?error=${encodeURIComponent(error.message)}`)
    throw error
  }
  revalidatePath("/utr")
  redirect("/utr")
}

export async function closeUtrAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  try {
    closeUtrMovie(user.id, Number(formData.get("movieId")))
  } catch (error) {
    if (error instanceof UtrError) redirect(`/utr?error=${encodeURIComponent(error.message)}`)
    throw error
  }
  revalidatePath("/utr")
  redirect("/utr")
}
