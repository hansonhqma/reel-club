import Link from "next/link"
import { redirect } from "next/navigation"
import { BeliSubmitForm } from "@/components/beli-submit-form"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getBeliPending, loadBeliView } from "@/lib/beli"
import { BELI_BUCKET_LABELS } from "@/lib/beli-bridge"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Beli" }

export default async function BeliPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { view, error } = loadBeliView(user.id)
  const pending = getBeliPending(user.id)
  const pendingMovie = pending ? view?.movies.find((movie) => movie.id === pending.movieId) : null

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Beli</p>
        <h1 className="mt-1 font-heading text-4xl tracking-tight">Your ranking</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Add a movie for the club. Rank the others by picking a bucket, then answering a few &ldquo;which did you like
          more?&rdquo; questions. Scores run 0 to 10 and come from where each movie sits in your list.{" "}
          <Link href="/beli/leaderboard" className="text-primary underline-offset-4 hover:underline">
            Whose picks score best
          </Link>
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {pendingMovie ? (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed">
          You were in the middle of ranking <span className="font-medium">{pendingMovie.title}</span>.{" "}
          <Link href={`/beli/rank/${pendingMovie.id}`} className="text-primary underline-offset-4 hover:underline">
            Pick up where you left off
          </Link>
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Add a movie</CardTitle>
          <CardDescription className="text-base">
            Everyone else ranks it. You don&apos;t rank your own, so the leaderboard measures your picks, not your
            generosity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BeliSubmitForm />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-2xl">Up for ranking</h2>
          <p className="text-sm text-muted-foreground">Movies other members added that you haven&apos;t placed yet.</p>
        </div>
        {!view || view.rankable.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-6 text-sm ring-1 ring-foreground/10">
            Nothing waiting. Everything on the list is yours or already ranked.
          </p>
        ) : (
          <ul className="space-y-2">
            {view.rankable.map((movie) => (
              <li key={movie.id}>
                <Link
                  href={`/beli/rank/${movie.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
                >
                  <span>
                    <span className="font-medium">{movie.title}</span>
                    <span className="text-muted-foreground"> · {movie.submitterName}</span>
                  </span>
                  <span className="text-sm text-primary">Rank it</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-2xl">My list</h2>
          <p className="text-sm text-muted-foreground">Best first. Liked always sits above Fine, Fine above Didn&apos;t like.</p>
        </div>
        {!view || view.myList.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-6 text-sm ring-1 ring-foreground/10">
            Your list is empty. Rank a movie from the section above.
          </p>
        ) : (
          <ol className="space-y-2">
            {view.myList.map((row) => (
              <li key={row.movieId}>
                <Link
                  href={`/beli/movies/${row.movieId}`}
                  className="flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10"
                >
                  <span className="w-8 text-center font-heading text-2xl tabular-nums text-primary">{row.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-xl leading-tight">{row.movie}</span>
                    <Badge variant="secondary" className="mt-1">
                      {BELI_BUCKET_LABELS[row.bucket]}
                    </Badge>
                  </span>
                  <span className="font-heading text-2xl tabular-nums">{row.score.toFixed(1)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-2xl">Everything on the list</h2>
          <p className="text-sm text-muted-foreground">Community score is the average of every member&apos;s score.</p>
        </div>
        {!view || view.movies.length === 0 ? (
          <p className="rounded-xl bg-card px-4 py-6 text-sm ring-1 ring-foreground/10">No movies yet. Add the first one.</p>
        ) : (
          <ul className="space-y-2">
            {[...view.movies].reverse().map((movie) => (
              <li key={movie.id}>
                <Link
                  href={`/beli/movies/${movie.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
                >
                  <span>
                    <span className="font-medium">{movie.title}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {movie.submitterName}
                      {movie.submitterId === user.id ? " (you)" : ""}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {movie.communityScore == null
                      ? "Not ranked yet"
                      : `${movie.communityScore.toFixed(1)} · ${movie.scores.length} ${movie.scores.length === 1 ? "ranking" : "rankings"}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
