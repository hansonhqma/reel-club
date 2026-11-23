import { redirect } from "next/navigation"
import { Disclosure } from "@/components/disclosure"
import { RankEmblem } from "@/components/rank-emblem"
import { utrMovieFeed, type UtrMoviePerson } from "@/lib/utr-catalog"
import { UTR_BUCKET_LABELS } from "@/lib/utr-score"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Movies" }

export default async function MoviesPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const movies = utrMovieFeed(user.id)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-4xl tracking-tight">Movies</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tap a movie.</p>
      </div>
      {movies.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-6 text-sm ring-1 ring-foreground/10">No movies yet.</p>
      ) : (
        <ul className="space-y-2">
          {movies.map((movie) => {
            const done = movie.people.filter((person) => person.role !== "waiting")
            const waiting = movie.people.filter((person) => person.role === "waiting")
            return (
              <li key={movie.id}>
                <Disclosure
                  summary={
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-2xl leading-tight">{movie.title}</p>
                        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <RankEmblem rank={movie.suggesterRank} size="sm" showLabel={false} />
                          <span className="truncate">{movie.suggesterName}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium tracking-wide text-primary uppercase">
                          {movie.status === "open" ? "Open" : "Closed"}
                        </p>
                        {movie.revealed ? (
                          <>
                            <p className="font-heading text-2xl tabular-nums">
                              {movie.groupScore == null ? "—" : movie.groupScore.toFixed(1)}
                            </p>
                            {movie.ratingCount > 0 ? (
                              <p className="text-sm text-muted-foreground">
                                {movie.ratingCount} {movie.ratingCount === 1 ? "rating" : "ratings"}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  }
                >
                  {done.length === 0 && waiting.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {done.length > 0 ? (
                        <PersonList title={movie.revealed ? null : "Done"} people={done} />
                      ) : null}
                      {waiting.length > 0 ? <PersonList title="Waiting" people={waiting} /> : null}
                    </div>
                  )}
                </Disclosure>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PersonList({ title, people }: { title: string | null; people: UtrMoviePerson[] }) {
  return (
    <div>
      {title ? <h2 className="text-sm font-medium">{title}</h2> : null}
      <ul className="divide-y divide-border">
        {people.map((person) => (
          <li key={person.userId} className="flex items-center gap-2 py-2 text-sm">
            <RankEmblem rank={person.rank} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium">
              {person.name}
              {person.suggester ? " · Their pick" : ""}
            </span>
            <span className="shrink-0 text-muted-foreground">{personLine(person)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function personLine(person: UtrMoviePerson): string {
  if (person.role === "waiting") return "Waiting"
  if (person.role === "done") return "Done"
  if (person.role === "skipped") return "Didn't watch"
  const group = person.bucket ? UTR_BUCKET_LABELS[person.bucket] : "Rated"
  return person.score == null ? group : `${group} · ${person.score.toFixed(1)}`
}
