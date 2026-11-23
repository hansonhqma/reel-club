"use client"

import { useRef, useState } from "react"
import { useActionState } from "react"
import { closePreviewAction, closeUtrAction, type ClosePreview } from "@/app/utr/actions"
import { RankEmblem } from "@/components/rank-emblem"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { UtrRank } from "@/lib/utr-ranks"

export function CloseRatingsDialog({ movieId }: { movieId: number }) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<ClosePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [state, formAction, pending] = useActionState(closeUtrAction, null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const request = useRef(0)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    const ticket = ++request.current
    setPreview(null)
    setLoading(true)
    void closePreviewAction(movieId).then((result) => {
      if (ticket !== request.current) return
      setPreview(result)
      setLoading(false)
    })
  }

  const waiting = preview && "waiting" in preview ? preview.waiting : null
  const previewError = preview && "error" in preview ? preview.error : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal>
      <Button
        type="button"
        variant="destructive"
        className="h-11 bg-destructive px-4 text-base text-white hover:bg-destructive/90"
        onClick={() => onOpenChange(true)}
      >
        Close ratings
      </Button>
      <DialogContent
        showCloseButton={false}
        initialFocus={cancelRef}
        role="alertdialog"
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogTitle className="font-heading text-2xl">Close ratings?</DialogTitle>
        <DialogDescription className="text-base leading-relaxed text-foreground">
          Make sure everyone who wants to rate this movie has their ratings in. Once ratings are closed, they
          can&apos;t be changed.
        </DialogDescription>
        {loading ? <p className="text-sm text-muted-foreground">Checking who&apos;s still out…</p> : null}
        {waiting ? <ClosePreviewList waiting={waiting} /> : null}
        {previewError ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {previewError}
          </p>
        ) : null}
        {state?.error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <input type="hidden" name="movieId" value={movieId} />
          <DialogClose
            disabled={pending}
            render={
              <Button ref={cancelRef} type="button" variant="outline" className="h-11 px-4 text-base" />
            }
          >
            Cancel
          </DialogClose>
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || loading}
            className="h-11 bg-destructive px-4 text-base text-white hover:bg-destructive/90"
          >
            {pending ? "Closing…" : "Close ratings"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ClosePreviewList({
  waiting,
}: {
  waiting: { userId: number; name: string; rank: UtrRank }[]
}) {
  if (waiting.length === 0) return <p className="text-sm font-medium">Everyone&apos;s in.</p>
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Still waiting on:</p>
      <ul className="divide-y divide-border rounded-xl bg-background ring-1 ring-foreground/10">
        {waiting.map((person) => (
          <li key={person.userId} className="flex items-center gap-2 px-3 py-2">
            <RankEmblem rank={person.rank} size="sm" />
            <span className="truncate font-medium">{person.name}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">They&apos;ll count as didn&apos;t watch.</p>
    </div>
  )
}
