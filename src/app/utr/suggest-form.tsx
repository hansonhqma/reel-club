"use client"

import { useActionState } from "react"
import type { UtrActionState } from "@/app/utr/actions"

export function SuggestUtrForm({ action }: { action: (prev: UtrActionState, formData: FormData) => Promise<UtrActionState> }) {
  const [state, formAction] = useActionState(action, null as UtrActionState)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="title" required maxLength={200} placeholder="Movie title" className="h-11 flex-1 rounded-xl bg-background px-3 ring-1 ring-foreground/15" />
      <button className="h-11 rounded-xl bg-primary px-4 text-primary-foreground">Suggest</button>
      {state?.error ? <p className="w-full text-sm text-destructive">{state.error}</p> : null}
    </form>
  )
}
