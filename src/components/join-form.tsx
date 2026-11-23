"use client"

import { useActionState } from "react"
import { joinAction, type ActionState } from "@/app/actions"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function JoinForm({ inviteDisabled }: { inviteDisabled: boolean }) {
  const [state, action] = useActionState(joinAction, null as ActionState)
  if (inviteDisabled) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        This club isn&apos;t taking invite codes right now. Ask an admin to create your account, then log in.
      </p>
    )
  }
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          required
          autoComplete="username"
          placeholder="mira"
          className="h-11 text-base md:text-base"
        />
        <p className="text-xs text-muted-foreground">Used to log in. Letters, numbers, underscores.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Name on Rankings</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="nickname"
          placeholder="Mira"
          className="h-11 text-base md:text-base"
        />
        <p className="text-xs text-muted-foreground">This is the name the ranking system keeps. It can&apos;t be changed later.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="h-11 text-base md:text-base"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite">Invite code</Label>
        <Input id="invite" name="invite" required autoComplete="off" className="h-11 text-base md:text-base" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Joining…">Join the club</SubmitButton>
    </form>
  )
}
