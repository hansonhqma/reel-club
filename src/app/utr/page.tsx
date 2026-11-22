import { redirect } from "next/navigation"
import { suggestUtrAction, startUtrAction, answerUtrAction, restartUtrAction, skipUtrAction, closeUtrAction } from "@/app/utr/actions"
import { SuggestUtrForm } from "@/app/utr/suggest-form"
import { UTR_BUCKETS, UTR_BUCKET_LABELS } from "@/lib/utr-score"
import { getOpenUtrMovie, utrCloses, utrList, utrPending, type UtrMovie } from "@/lib/utr"
import { getDb } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Rate" }

export default async function UtrPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const query = await searchParams
  const open = getOpenUtrMovie()
  const list = utrList(user.id)
  const pending = open ? utrPending(user.id, open.id) : null
  const response = open
    ? (getDb()
        .prepare("SELECT kind, bucket FROM utr_responses WHERE movie_id = ? AND user_id = ?")
        .get(open.id, user.id) as { kind: string; bucket: string | null } | undefined)
    : undefined
  const closes = utrCloses()
  const latest = closes.at(-1)
  const canClose = open != null && (open.suggesterId === user.id || user.isAdmin)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">One rating</p>
        <h1 className="mt-1 font-heading text-4xl tracking-tight">Taste list</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          One movie is open at a time. Say how much you enjoyed it, then place it among the movies you put in that same
          group. Your list updates immediately. The shared board updates when the movie closes.
        </p>
      </div>
      {query.error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {query.error}
        </p>
      ) : null}
      {open ? (
        <OpenMovie movie={open} pending={pending} responded={response?.kind} canClose={canClose} />
      ) : (
        <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <h2 className="font-heading text-2xl">Suggest the next movie</h2>
          <SuggestUtrForm action={suggestUtrAction} />
        </section>
      )}
      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Your list</h2>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing placed yet.</p>
        ) : (
          <ol className="space-y-2">
            {list.map((row) => (
              <li key={row.movieId} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <span>
                  <span className="font-medium">{row.title}</span>
                  <span className="text-muted-foreground"> · {UTR_BUCKET_LABELS[row.bucket]}</span>
                </span>
                <span className="font-heading text-2xl tabular-nums">{row.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {latest ? (
        <section className="space-y-2">
          <h2 className="font-heading text-2xl">Board after {latest.title}</h2>
          <ul className="space-y-1 text-sm">
            {Object.entries(latest.elo)
              .sort((a, b) => b[1] - a[1])
              .map(([name, elo]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="tabular-nums">
                    {elo.toFixed(1)}
                    {latest.fromNew[name] || latest.fromOlder[name]
                      ? ` (${(latest.fromNew[name] ?? 0) >= 0 ? "+" : ""}${(latest.fromNew[name] ?? 0).toFixed(1)} new, ${(latest.fromOlder[name] ?? 0) >= 0 ? "+" : ""}${(latest.fromOlder[name] ?? 0).toFixed(1)} re-sorted)`
                      : ""}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function OpenMovie({
  movie,
  pending,
  responded,
  canClose,
}: {
  movie: UtrMovie
  pending: ReturnType<typeof utrPending>
  responded?: string
  canClose: boolean
}) {
  return (
    <section className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Open</p>
        <h2 className="font-heading text-3xl">{movie.title}</h2>
        <p className="text-sm text-muted-foreground">Suggested by {movie.suggesterName}</p>
      </div>
      {pending && !pending.done ? (
        <form action={answerUtrAction} className="space-y-3">
          <input type="hidden" name="movieId" value={movie.id} />
          <input type="hidden" name="history" value={pending.historyLength} />
          <p className="text-sm">Which did you enjoy more? About {pending.questionsLeft} left.</p>
          <div className="flex flex-wrap gap-2">
            <button name="answer" value="new" className="rounded-xl bg-primary px-4 py-3 text-primary-foreground">
              {movie.title}
            </button>
            <button name="answer" value="old" className="rounded-xl bg-muted px-4 py-3">
              {pending.pivotTitle}
            </button>
            <button name="answer" value="back" className="rounded-xl px-4 py-3 text-sm" disabled={pending.historyLength === 0}>
              Back
            </button>
          </div>
        </form>
      ) : responded ? (
        <p className="text-sm">{responded === "skip" ? "You didn't watch this one." : "Your place on the list is saved."}</p>
      ) : (
        <form action={startUtrAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="movieId" value={movie.id} />
          {UTR_BUCKETS.map((bucket) => (
            <button key={bucket} name="bucket" value={bucket} className="rounded-xl bg-muted px-4 py-3">
              {UTR_BUCKET_LABELS[bucket]}
            </button>
          ))}
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={skipUtrAction}>
          <input type="hidden" name="movieId" value={movie.id} />
          <button className="rounded-xl px-3 py-2 text-sm ring-1 ring-foreground/15">I didn&apos;t watch</button>
        </form>
        <form action={restartUtrAction}>
          <input type="hidden" name="movieId" value={movie.id} />
          <button className="rounded-xl px-3 py-2 text-sm ring-1 ring-foreground/15">Start over</button>
        </form>
        {canClose ? (
          <form action={closeUtrAction}>
            <input type="hidden" name="movieId" value={movie.id} />
            <button className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground">Close ratings</button>
          </form>
        ) : null}
      </div>
    </section>
  )
}
