"use client"

import { useActionState } from "react"
import type { ActionState } from "@/app/actions"
import { beliSubmitAction } from "@/app/beli/actions"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function BeliSubmitForm() {
  const [state, action] = useActionState(beliSubmitAction, null as ActionState)
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="beli-title">Movie</Label>
        <Input
          id="beli-title"
          name="title"
          required
          maxLength={200}
          placeholder="A movie you want the club to rank"
          className="h-11 text-base md:text-base"
          autoComplete="off"
        />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Adding…">Add it</SubmitButton>
    </form>
  )
}
