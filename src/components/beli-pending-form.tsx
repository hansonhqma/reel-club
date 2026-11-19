"use client"

import { useFormStatus } from "react-dom"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

type FormAction = (formData: FormData) => void | Promise<void>

export function BeliPendingForm({
  action,
  pendingLabel,
  className,
  children,
  cancelAction,
}: {
  action: FormAction
  pendingLabel: string
  className?: string
  children: React.ReactNode
  cancelAction?: FormAction
}) {
  return (
    <form action={action}>
      <BeliPendingFields pendingLabel={pendingLabel} className={className} cancelAction={cancelAction}>
        {children}
      </BeliPendingFields>
    </form>
  )
}

function BeliPendingFields({
  pendingLabel,
  className,
  children,
  cancelAction,
}: {
  pendingLabel: string
  className?: string
  children: React.ReactNode
  cancelAction?: FormAction
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
        {cancelAction ? (
          <div className="sm:col-span-2">
            <button
              type="submit"
              formAction={cancelAction}
              className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-4 text-base")}
            >
              Start over
            </button>
          </div>
        ) : null}
      </fieldset>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {pendingLabel}
        </p>
      ) : null}
    </>
  )
}
