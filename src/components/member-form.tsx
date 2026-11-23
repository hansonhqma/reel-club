"use client"

import { useActionState } from "react"
import { createMemberAction, type ActionState } from "@/app/actions"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function MemberForm() {
  const [state, action] = useActionState(createMemberAction, null as ActionState)
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-username">Username</Label>
        <Input id="new-username" name="username" required autoComplete="off" className="h-11 text-base md:text-base" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-name">Name on Rankings</Label>
        <Input id="new-name" name="name" required autoComplete="off" className="h-11 text-base md:text-base" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">Temporary password</Label>
        <Input
          id="new-password"
          name="password"
          type="text"
          required
          minLength={8}
          autoComplete="off"
          className="h-11 text-base md:text-base"
        />
        <p className="text-xs text-muted-foreground">Shown here so you can send it. It is stored only as a hash.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isAdmin" className="size-4 accent-primary" />
        Admin, can add members and remove unscored suggestions
      </label>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Adding…">Add member</SubmitButton>
    </form>
  )
}
