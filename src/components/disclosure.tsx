import type { ReactNode } from "react"

export function Disclosure({
  summary,
  children,
}: {
  summary: ReactNode
  children: ReactNode
}) {
  return (
    <details className="rounded-2xl bg-card ring-1 ring-foreground/10">
      <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden">{summary}</summary>
      <div className="border-t border-border px-3 py-3">{children}</div>
    </details>
  )
}
