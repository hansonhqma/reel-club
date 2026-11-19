import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { beliAnswerAction, beliCancelAction, beliStartAction } from "@/app/beli/actions"
import { BeliPendingForm } from "@/components/beli-pending-form"
import { BeliReplaceGate } from "@/components/beli-replace-gate"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  beliStepToken,
  getBeliMovie,
  getBeliPending,
  getBeliPlacement,
  otherBeliPending,
  peekBeliRanking,
  type BeliPending,
} from "@/lib/beli"
import { BELI_BUCKET_LABELS, BELI_BUCKETS, type BeliBucket, type BeliStepResult } from "@/lib/beli-bridge"
import { getCurrentUser } from "@/lib/session"
import { cn } from "cn"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const movieId = Number(id)
  const movie = Number.isInteger(movieId) && movieId > 0 ? getBeliMovie(movieId) : null
  return { title: movie ? `Rank ${movie.title}` : "Rank" }
}

function readPending(userId: number): { pending: BeliPending | null; unreadable: boolean } {
  try {
    return { pending: getBeliPending(userId), unreadable: false }
  } catch {
    return { pending: null, unreadable: true }
  }
}

function bucketLabel(bucket: string): string | null {
  if (bucket === "liked" || bucket === "fine" || bucket === "disliked") {
    return BELI_BUCKET_LABELS[bucket as BeliBucket]
  }
  return null
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
  const own = movie.submitterId === user.id

  let step: BeliStepResult | null = null
  let error: string | null = query.error ?? null
  let peekFailed = false
  if (!own) {
    try {
      step = peekBeliRanking(user.id, movie.id)
    } catch (engineError) {
      peekFailed = true
      error = engineError instanceof Error ? engineError.message : "The Beli engine failed."
    }
  }
  // A stored search that was already complete got placed just now.
  if (step?.done) redirect(`/beli/movies/${movie.id}`)

  const { pending, unreadable } = own ? { pending: null, unreadable: false } : readPending(user.id)
  const stepToken = beliStepToken(unreadable ? null : pending)
  const pendingHere = pending?.movieId === movie.id
  const otherPending = !own && !unreadable ? otherBeliPending(user.id, movie.id) : null
  const showResume = !own && !step && (unreadable || (peekFailed && pendingHere))

  const bucketSection = (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl">{placement ? "Pick a bucket again" : "Pick a bucket"}</h2>
        <p className="text-sm text-muted-foreground">
          Then a few quick comparisons place it inside that bucket. Liked scores 7 to 10, Fine 4 to 6.9, Didn&apos;t
          like 0 to 3.9.
        </p>
      </div>
      {peekFailed && !pending && !unreadable ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          The unfinished ranking was cleared. Pick a bucket to start again.
        </p>
      ) : null}
      <BeliPendingForm action={beliStartAction} pendingLabel="Starting…" className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="movieId" value={movie.id} className="hidden" />
        <input type="hidden" name="step" value={stepToken} className="hidden" />
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
      </BeliPendingForm>
    </section>
  )

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

      {own ? (
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
          <BeliPendingForm
            action={beliAnswerAction}
            cancelAction={beliCancelAction}
            pendingLabel="Saving…"
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="movieId" value={movie.id} className="hidden" />
            <input type="hidden" name="step" value={stepToken} className="hidden" />
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
          </BeliPendingForm>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Too tough places the new movie just below the one it&apos;s compared with. You can re-rank later.
          </p>
        </section>
      ) : showResume ? (
        <ResumePanel movieId={movie.id} pending={pendingHere ? pending : null} unreadable={unreadable} />
      ) : otherPending ? (
        <BeliReplaceGate
          otherTitle={otherPending.title}
          otherBucket={bucketLabel(otherPending.bucket) ?? undefined}
          resumeHref={`/beli/rank/${otherPending.movieId}`}
        >
          {bucketSection}
        </BeliReplaceGate>
      ) : (
        bucketSection
      )}
    </article>
  )
}

function ResumePanel({
  movieId,
  pending,
  unreadable,
}: {
  movieId: number
  pending: BeliPending | null
  unreadable: boolean
}) {
  const label = pending ? bucketLabel(pending.insertion.bucket) : null
  const answers = pending?.insertion.history.length ?? 0
  return (
    <section className="space-y-4 rounded-xl bg-accent px-4 py-4">
      <h2 className="font-heading text-2xl">Still ranking this one</h2>
      <p className="text-sm leading-relaxed">
        {unreadable
          ? "An unfinished ranking is stored, and it couldn't be read. The bucket choices stay hidden so a new one doesn't replace it."
          : `The next question didn't load, so the bucket choices stay hidden. You're still ranking this movie${label ? ` in ${label}` : ""}.${
              answers > 0 ? ` ${answers} ${answers === 1 ? "answer is" : "answers are"} saved.` : ""
            }`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/beli/rank/${movieId}`} className={cn(buttonVariants(), "h-11 px-4 text-base")}>
          Try again
        </Link>
        <form action={beliCancelAction}>
          <input type="hidden" name="movieId" value={movieId} />
          <SubmitButton variant="ghost" pendingLabel="Clearing…">
            Start over
          </SubmitButton>
        </form>
      </div>
    </section>
  )
}
