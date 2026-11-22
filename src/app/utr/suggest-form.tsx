"use client"

import { useActionState } from "react"
import type { UtrActionState } from "@/app/utr/actions"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function SuggestUtrForm({
  action,
}: {
  action: (prev: UtrActionState, formData: FormData) => Promise<UtrActionState>
}) {
  const [state, formAction] = useActionState(action, null as UtrActionState)
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="utr-title">Movie</Label>
        <Input
          id="utr-title"
          name="title"
          required
          maxLength={200}
          placeholder="What should we watch?"
          autoComplete="off"
          className="h-11 text-base md:text-base"
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Suggesting…">Suggest it</SubmitButton>
    </form>
  )
}
