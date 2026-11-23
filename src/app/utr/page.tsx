import Link from "next/link"
import { redirect } from "next/navigation"
import { suggestUtrAction } from "@/app/utr/actions"
import { OpenMovie } from "@/app/utr/open-movie"
import { SuggestUtrForm } from "@/app/utr/suggest-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getOpenUtrMovie, utrList, utrPending } from "@/lib/utr"
import { utrOpenRoster } from "@/lib/utr-roster"
import { UTR_BUCKET_LABELS, isUtrBucket, type UtrBucket } from "@/lib/utr-score"
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
  const responseRow = open
    ? (getDb()
        .prepare("SELECT kind, bucket FROM utr_responses WHERE movie_id = ? AND user_id = ?")
        .get(open.id, user.id) as { kind: string; bucket: string | null } | undefined)
    : undefined
  const response = readResponse(responseRow)
  const canClose = open != null && (open.suggesterId === user.id || user.isAdmin)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-heading text-4xl tracking-tight">Rate</h1>
        <p className="mt-2 text-sm">
          <Link href="/how" className="text-primary underline-offset-4 hover:underline">
            How this works
          </Link>
        </p>
      </div>

      {query.error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {query.error}
        </p>
      ) : null}

      {open ? (
        <OpenMovie
          movie={open}
          youId={user.id}
          youSuggested={open.suggesterId === user.id}
          canClose={canClose}
          pending={pending && !pending.done ? pending : null}
          response={response}
          roster={utrOpenRoster(open.id)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Suggest the next movie</CardTitle>
          </CardHeader>
          <CardContent>
            <SuggestUtrForm action={suggestUtrAction} />
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Your list</h2>
        {list.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-6 text-sm ring-1 ring-foreground/10">Nothing placed yet.</p>
        ) : (
          <ol className="space-y-2">
            {list.map((row) => (
              <li key={row.movieId}>
                <div className="flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
                  <span className="w-8 text-center font-heading text-2xl tabular-nums text-primary">{row.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-xl leading-tight">{row.title}</span>
                    <span className="text-sm text-muted-foreground">{UTR_BUCKET_LABELS[row.bucket as UtrBucket]}</span>
                  </span>
                  <span className="font-heading text-2xl tabular-nums">{row.score.toFixed(1)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function readResponse(row: { kind: string; bucket: string | null } | undefined): {
  kind: "rate" | "skip"
  bucket: UtrBucket | null
} | null {
  if (!row || (row.kind !== "rate" && row.kind !== "skip")) return null
  return { kind: row.kind, bucket: row.bucket && isUtrBucket(row.bucket) ? row.bucket : null }
}
