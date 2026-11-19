"use client"

import { useState } from "react"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"

type FormAction = (formData: FormData) => void | Promise<void>

export function ConfirmSubmit({
  action,
  fields,
  label,
  confirmLabel,
  pendingLabel,
  warning,
}: {
  action: FormAction
  fields: { name: string; value: string }[]
  label: string
  confirmLabel: string
  pendingLabel: string
  warning: string
}) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <Button type="button" variant="destructive" className="h-11 px-4 text-base" onClick={() => setArmed(true)}>
        {label}
      </Button>
    )
  }
  return (
    <form action={action} className="space-y-3">
      {fields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      <p className="text-sm leading-relaxed text-muted-foreground">{warning}</p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="destructive" pendingLabel={pendingLabel}>
          {confirmLabel}
        </SubmitButton>
        <Button type="button" variant="ghost" className="h-11 px-4 text-base" onClick={() => setArmed(false)}>
          Keep it
        </Button>
      </div>
    </form>
  )
}
