import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { beliAnswerAction, beliCancelAction, beliStartAction } from "@/app/beli/actions"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { getBeliMovie, getBeliPlacement, peekBeliRanking } from "@/lib/beli"
import { BELI_BUCKET_LABELS, BELI_BUCKETS, type BeliStepResult } from "@/lib/beli-bridge"
import { getCurrentUser } from "@/lib/session"
import { cn } from "cn"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const movieId = Number(id)
  const movie = Number.isInteger(movieId) && movieId > 0 ? getBeliMovie(movieId) : null
  return { title: movie ? `Rank ${movie.title}` : "Rank" }
}

export default async function BeliRankPage({
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
  const placement = getBeliPlacement(user.id, movie.id)

  let step: BeliStepResult | null = null
  let error: string | null = query.error ?? null
  if (movie.submitterId !== user.id) {
    try {
      step = peekBeliRanking(user.id, movie.id)
    } catch (engineError) {
      error = engineError instanceof Error ? engineError.message : "The Beli engine failed."
    }
  }
  // A stored search that was already complete got placed just now.
  if (step?.done) redirect(`/beli/movies/${movie.id}`)

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm">
        <Link href="/beli" className="text-primary underline-offset-4 hover:underline">
          Your ranking
        </Link>
        {" · "}
        <Link href={`/beli/movies/${movie.id}`} className="text-primary underline-offset-4 hover:underline">
          About this movie
        </Link>
      </p>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={placement ? "secondary" : "default"}>{placement ? "Re-ranking" : "Ranking"}</Badge>
          {placement ? (
            <span className="text-sm text-muted-foreground">
              Currently in {BELI_BUCKET_LABELS[placement.bucket]}
            </span>
          ) : null}
        </div>
        <h1 className="font-heading text-4xl tracking-tight">{movie.title}</h1>
        <p className="text-muted-foreground">Added by {movie.submitterName}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {movie.submitterId === user.id ? (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed">
          You added this one, so you don&apos;t rank it. The others decide where it lands.
        </p>
      ) : step && !step.done ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-2xl">Which did you like more?</h2>
            <p className="text-sm text-muted-foreground">
              Comparing inside {BELI_BUCKET_LABELS[step.insertion.bucket]}. At most {step.questions_left}{" "}
              {step.questions_left === 1 ? "question" : "questions"} left.
            </p>
          </div>
          <form action={beliAnswerAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="movieId" value={movie.id} />
            <button
              type="submit"
              name="answer"
              value="new"
              className="rounded-2xl bg-card px-4 py-6 text-left ring-1 ring-foreground/10 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="block text-xs font-medium tracking-[0.18em] text-primary uppercase">New</span>
              <span className="mt-1 block font-heading text-2xl leading-tight">{movie.title}</span>
            </button>
            <button
              type="submit"
              name="answer"
              value="old"
              className="rounded-2xl bg-card px-4 py-6 text-left ring-1 ring-foreground/10 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="block text-xs font-medium tracking-[0.18em] text-primary uppercase">Already ranked</span>
              <span className="mt-1 block font-heading text-2xl leading-tight">{step.pivot}</span>
            </button>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="submit"
                name="answer"
                value="too_tough"
                className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4 text-base")}
              >
                Too tough to call
              </button>
              <button
                type="submit"
                name="answer"
                value="back"
                disabled={step.insertion.history.length === 0}
                className={cn(buttonVariants({ variant: "ghost" }), "h-11 px-4 text-base")}
              >
                Back
              </button>
            </div>
          </form>
          <form action={beliCancelAction}>
            <input type="hidden" name="movieId" value={movie.id} />
            <SubmitButton variant="ghost" pendingLabel="Clearing…">
              Start over
            </SubmitButton>
          </form>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Too tough places the new movie just below the one it&apos;s compared with. You can re-rank later.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-2xl">{placement ? "Pick a bucket again" : "Pick a bucket"}</h2>
            <p className="text-sm text-muted-foreground">
              Then a few quick comparisons place it inside that bucket. Liked scores 7 to 10, Fine 4 to 6.9, Didn&apos;t
              like 0 to 3.9.
            </p>
          </div>
          <form action={beliStartAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="movieId" value={movie.id} />
            {BELI_BUCKETS.map((bucket) => (
              <button
                key={bucket}
                type="submit"
                name="bucket"
                value={bucket}
                className="rounded-2xl bg-card px-4 py-6 text-left ring-1 ring-foreground/10 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="block font-heading text-2xl leading-tight">{BELI_BUCKET_LABELS[bucket]}</span>
              </button>
            ))}
          </form>
        </section>
      )}
    </article>
  )
}
