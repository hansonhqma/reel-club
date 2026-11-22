"use client"

import { useFormStatus } from "react-dom"
import { cn } from "cn"

type FormAction = (formData: FormData) => void | Promise<void>

export function PendingForm({
  action,
  pendingLabel,
  className,
  children,
}: {
  action: FormAction
  pendingLabel: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <form action={action}>
      <PendingFields pendingLabel={pendingLabel} className={className}>
        {children}
      </PendingFields>
    </form>
  )
}

function PendingFields({
  pendingLabel,
  className,
  children,
}: {
  pendingLabel: string
  className?: string
  children: React.ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <>
      <fieldset
        disabled={pending}
        aria-busy={pending}
        className={cn("w-full min-w-0 border-0 p-0 disabled:opacity-60", className)}
      >
        {children}
      </fieldset>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {pendingLabel}
        </p>
      ) : null}
    </>
  )
}
