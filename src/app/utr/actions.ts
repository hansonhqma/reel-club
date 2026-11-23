"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { STARTING_RANK } from "@/components/rank-emblem"
import { UtrError, answerUtrRating, closeUtrMovie, getOpenUtrMovie, restartUtrRating, skipUtrMovie, startUtrRating, suggestUtrMovie, utrBoard } from "@/lib/utr"
import { utrUnanswered } from "@/lib/utr-roster"
import type { UtrRank } from "@/lib/utr-ranks"
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

export type ClosePreview =
  | { waiting: { userId: number; name: string; rank: UtrRank }[] }
  | { error: string }

export async function closePreviewAction(movieId: number): Promise<ClosePreview> {
  const user = await getCurrentUser()
  if (!user) return { error: "You need to log in again." }
  const open = getOpenUtrMovie()
  if (!open || open.id !== movieId) return { error: "That movie is not open for ratings." }
  if (open.suggesterId !== user.id && !user.isAdmin) {
    return { error: "Only the suggester or an admin can close ratings." }
  }
  const ranks = new Map((utrBoard()?.rows ?? []).map((row) => [row.name, row.rank]))
  return {
    waiting: utrUnanswered(movieId, user.id).map((person) => ({
      ...person,
      rank: ranks.get(person.name) ?? STARTING_RANK,
    })),
  }
}

export async function closeUtrAction(_prev: UtrActionState, formData: FormData): Promise<UtrActionState> {
  const user = await getCurrentUser()
  if (!user) return { error: "You need to log in again." }
  try {
    closeUtrMovie(user.id, Number(formData.get("movieId")))
  } catch (error) {
    return fail(error)
  }
  revalidatePath("/utr")
  revalidatePath("/movies")
  revalidatePath("/rankings")
  redirect("/utr")
}
