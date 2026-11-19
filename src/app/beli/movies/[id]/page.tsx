import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { beliDeleteAction, beliRemoveAction } from "@/app/beli/actions"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { beliRankingCount, getBeliMovie, loadBeliView } from "@/lib/beli"
import { BELI_BUCKET_LABELS } from "@/lib/beli-bridge"
import { formatWhen } from "@/lib/format"
import { getCurrentUser } from "@/lib/session"
import { cn } from "cn"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const movieId = Number(id)
  const movie = Number.isInteger(movieId) && movieId > 0 ? getBeliMovie(movieId) : null
  return { title: movie?.title ?? "Film" }
}

export default async function BeliMoviePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { id: rawId } = await params
  const id = Number(rawId)
  if (!Number.isInteger(id) || id < 1) notFound()
  const movie = getBeliMovie(id)
  if (!movie) notFound()
  const query = await searchParams
  const { view, error } = loadBeliView(user.id)
  const detail = view?.movies.find((item) => item.id === movie.id) ?? null
  const scores = detail?.scores ?? []
  const mine = scores.find((row) => row.member === user.name) ?? null
  const own = movie.submitterId === user.id
  const ranked = beliRankingCount(movie.id) > 0
  const canDelete = ranked ? user.isAdmin : own || user.isAdmin

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm">
        <Link href="/beli" className="text-primary underline-offset-4 hover:underline">
          Your ranking
        </Link>
      </p>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={scores.length > 0 ? "secondary" : "default"}>
            {scores.length > 0 ? "Ranked" : "Not ranked yet"}
          </Badge>
          <span className="text-sm text-muted-foreground">Added {formatWhen(movie.submittedAt)}</span>
        </div>
        <h1 className="font-heading text-4xl tracking-tight">{movie.title}</h1>
        <p className="text-muted-foreground">
          Added by {movie.submitterName}
          {own ? " (you)" : ""}
        </p>
      </header>

      {query.error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {query.error}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="flex items-center gap-4 rounded-2xl bg-card px-4 py-4 ring-1 ring-foreground/10">
        <span className="font-heading text-5xl tabular-nums text-primary">
          {detail?.communityScore == null ? "–" : detail.communityScore.toFixed(1)}
        </span>
        <span className="text-sm leading-relaxed text-muted-foreground">
          Community score: the average of every member&apos;s score, from {scores.length}{" "}
          {scores.length === 1 ? "ranking" : "rankings"}.
        </span>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Who ranked it</h2>
        {scores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody yet. Anyone except {movie.submitterName} can rank it from their Beli page.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-foreground/10">
            {scores.map((row) => (
              <li key={row.member} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium">
                  {row.member}
                  {row.member === user.name ? " · you" : ""}
                </span>
                <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                  <Badge variant="outline">{BELI_BUCKET_LABELS[row.bucket]}</Badge>
                  {row.score.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {own ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed">
          You added this one, so you don&apos;t rank it. Its community score feeds your spot on the{" "}
          <Link href="/beli/leaderboard" className="text-primary underline-offset-4 hover:underline">
            leaderboard
          </Link>
          .
        </p>
      ) : (
        <section className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/beli/rank/${movie.id}`} className={cn(buttonVariants(), "h-11 px-4 text-base")}>
              {mine ? "Re-rank it" : "Rank it"}
            </Link>
            {mine ? (
              <form action={beliRemoveAction}>
                <input type="hidden" name="movieId" value={movie.id} />
                <SubmitButton variant="outline" pendingLabel="Removing…">
                  Remove from my list
                </SubmitButton>
              </form>
            ) : null}
          </div>
          {mine ? (
            <p className="text-sm text-muted-foreground">
              You have it in {BELI_BUCKET_LABELS[mine.bucket]} at {mine.score.toFixed(1)}. Re-ranking asks the questions
              again; removing drops it from your list and shifts the rest up.
            </p>
          ) : null}
        </section>
      )}

      {canDelete ? (
        <form action={beliDeleteAction} className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <input type="hidden" name="movieId" value={movie.id} />
          {ranked ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirm" value="yes" required />
              Remove everyone&apos;s rankings of this movie
            </label>
          ) : null}
          <SubmitButton variant="outline" pendingLabel="Removing…">
            Remove from the club
          </SubmitButton>
        </form>
      ) : null}
    </article>
  )
}
