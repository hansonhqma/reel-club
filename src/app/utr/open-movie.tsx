import {
  answerUtrAction,
  closeUtrAction,
  restartUtrAction,
  skipUtrAction,
  startUtrAction,
} from "@/app/utr/actions"
import { ConfirmSubmit } from "@/components/confirm-submit"
import { PendingForm } from "@/components/pending-form"
import { RankEmblem, STARTING_RANK } from "@/components/rank-emblem"
import { buttonVariants } from "@/components/ui/button"
import { utrBoard, type UtrMovie } from "@/lib/utr"
import type { UtrRosterEntry } from "@/lib/utr-roster"
import { UTR_BUCKET_LABELS, UTR_CHOICES, type UtrBucket } from "@/lib/utr-score"
import { cn } from "cn"

export function OpenMovie({
  movie,
  youId,
  youSuggested,
  canClose,
  pending,
  response,
  roster,
}: {
  movie: UtrMovie
  youId: number
  youSuggested: boolean
  canClose: boolean
  pending: {
    bucket: UtrBucket
    pivotTitle: string
    questionsLeft: number
    historyLength: number
  } | null
  response: { kind: "rate" | "skip"; bucket: UtrBucket | null } | null
  roster: UtrRosterEntry[]
}) {
  const answered = roster.filter((row) => row.kind != null)
  const waiting = roster.filter((row) => row.kind == null)
  const ranks = new Map((utrBoard()?.rows ?? []).map((row) => [row.name, row.rank]))

  return (
    <section className="space-y-5 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
      <div className="space-y-2">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Open now</p>
        <h2 className="font-heading text-3xl tracking-tight sm:text-4xl">{movie.title}</h2>
        <p className="text-sm text-muted-foreground">
          Suggested by {movie.suggesterName}
          {youSuggested ? " (you)" : ""}
        </p>
      </div>

      {pending ? (
        <div className="space-y-3">
          <div>
            <h3 className="font-heading text-2xl">Which did you enjoy more?</h3>
            <p className="text-sm text-muted-foreground">Pick the one you enjoyed more.</p>
          </div>
          <PendingForm action={answerUtrAction} pendingLabel="Saving…" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="movieId" value={movie.id} className="hidden" />
            <input type="hidden" name="history" value={pending.historyLength} className="hidden" />
            <button
              type="submit"
              name="answer"
              value="new"
              className="rounded-2xl bg-primary px-4 py-6 text-left text-primary-foreground"
            >
              <span className="block text-xs font-medium tracking-[0.16em] uppercase">This movie</span>
              <span className="mt-1 block font-heading text-2xl leading-tight">{movie.title}</span>
            </button>
            <button
              type="submit"
              name="answer"
              value="old"
              className="rounded-2xl bg-background px-4 py-6 text-left ring-1 ring-foreground/10"
            >
              <span className="block text-xs font-medium tracking-[0.16em] text-primary uppercase">Already on your list</span>
              <span className="mt-1 block font-heading text-2xl leading-tight">{pending.pivotTitle}</span>
            </button>
            <div className="sm:col-span-2">
              <button
                type="submit"
                name="answer"
                value="back"
                disabled={pending.historyLength === 0}
                className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-4 text-base")}
              >
                Back
              </button>
            </div>
          </PendingForm>
        </div>
      ) : response ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed">
          {response.kind === "skip"
            ? "You didn't watch this one."
            : `Saved in ${response.bucket ? UTR_BUCKET_LABELS[response.bucket] : "your list"}.`}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <h3 className="font-heading text-2xl">How much did you enjoy it?</h3>
          </div>
          <PendingForm action={startUtrAction} pendingLabel="Starting…" className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="movieId" value={movie.id} className="hidden" />
            {UTR_CHOICES.map((bucket) => (
              <button
                key={bucket}
                type="submit"
                name="bucket"
                value={bucket}
                className="rounded-2xl bg-background px-4 py-5 text-left ring-1 ring-foreground/10 hover:bg-accent"
              >
                <span className="block font-heading text-2xl leading-tight">{UTR_BUCKET_LABELS[bucket]}</span>
              </button>
            ))}
          </PendingForm>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <PendingForm action={skipUtrAction} pendingLabel="Saving…">
          <input type="hidden" name="movieId" value={movie.id} className="hidden" />
          <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "h-11 bg-card px-4 text-base")}>
            I didn&apos;t watch
          </button>
        </PendingForm>
        <PendingForm action={restartUtrAction} pendingLabel="Clearing…">
          <input type="hidden" name="movieId" value={movie.id} className="hidden" />
          <button type="submit" className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-4 text-base")}>
            Start over
          </button>
        </PendingForm>
        {canClose ? (
          <ConfirmSubmit
            action={closeUtrAction}
            fields={[{ name: "movieId", value: String(movie.id) }]}
            label="Close ratings"
            confirmLabel="Close it"
            pendingLabel="Closing…"
            warning="Close ratings? Anyone who hasn't answered counts as didn't watch. This can't be undone."
          />
        ) : null}
      </div>

      <div className="space-y-4 border-t border-border pt-4">
        <div>
          <h3 className="font-heading text-2xl">Who&apos;s in</h3>
          {waiting.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Waiting on {waiting.length} {waiting.length === 1 ? "person" : "people"}.
            </p>
          ) : null}
        </div>
        <Roster title="Answered" rows={answered} youId={youId} ranks={ranks} empty="Nobody yet." />
        <Roster title="Still to go" rows={waiting} youId={youId} ranks={ranks} empty="Everyone has answered." />
      </div>
    </section>
  )
}

function Roster({
  title,
  rows,
  youId,
  ranks,
  empty,
}: {
  title: string
  rows: UtrRosterEntry[]
  youId: number
  ranks: Map<string, { tier: string; division: string | null; label: string }>
  empty: string
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl bg-background ring-1 ring-foreground/10">
          {rows.map((row) => (
            <li key={row.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <RankEmblem rank={ranks.get(row.name) ?? STARTING_RANK} size="sm" />
                <span className="truncate font-medium">
                  {row.name}
                  {row.userId === youId ? " · you" : ""}
                </span>
              </span>
              <span className="shrink-0 text-muted-foreground">{statusLabel(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function statusLabel(row: UtrRosterEntry): string {
  if (row.kind === "skip") return "Didn't watch"
  if (row.kind === "rate" && row.bucket) return UTR_BUCKET_LABELS[row.bucket]
  if (row.kind === "rate") return "Rated"
  return "Hasn't answered"
}
