"use client"

import { useState } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "cn"

export function BeliReplaceGate({
  otherTitle,
  otherBucket,
  resumeHref,
  children,
}: {
  otherTitle: string
  otherBucket?: string
  resumeHref: string
  children: React.ReactNode
}) {
  const [replacing, setReplacing] = useState(false)
  const where = otherBucket ? `${otherTitle} (${otherBucket})` : otherTitle
  if (!replacing) {
    return (
      <div className="space-y-3 rounded-xl bg-accent px-4 py-4">
        <p className="text-sm leading-relaxed">
          You&apos;re in the middle of ranking <span className="font-medium">{where}</span>. Starting this one drops
          that unfinished ranking. The movie itself stays on the list.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={resumeHref} className={cn(buttonVariants(), "h-11 px-4 text-base")}>
            Pick up where you left off
          </Link>
          <Button type="button" variant="outline" className="h-11 px-4 text-base" onClick={() => setReplacing(true)}>
            Rank this movie instead
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Picking a bucket drops your unfinished ranking of <span className="font-medium">{where}</span>.{" "}
        <button
          type="button"
          onClick={() => setReplacing(false)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Keep that ranking
        </button>
      </p>
      {children}
    </div>
  )
}
