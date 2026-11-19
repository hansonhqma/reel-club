import Link from "next/link"
import { redirect } from "next/navigation"
import { loadBeliView } from "@/lib/beli"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Beli leaderboard" }

export default async function BeliLeaderboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const { view, error } = loadBeliView(user.id)
  const rows = view?.leaderboard ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Beli</p>
        <h1 className="mt-1 font-heading text-4xl tracking-tight">Whose picks score best</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Each member&apos;s value is the average community score of the movies they added that someone has ranked.
          Ties go to whoever has more ranked picks. This is separate from the Elo board.{" "}
          <Link href="/beli" className="text-primary underline-offset-4 hover:underline">
            Back to your ranking
          </Link>
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {view && rows.every((row) => row.value == null) ? (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed">
          No pick has been ranked yet. Add a movie and rank someone else&apos;s to get the board moving.
        </p>
      ) : null}

      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.member} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
            <span className="w-8 text-center font-heading text-2xl tabular-nums text-primary">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-xl leading-tight">
                {row.member}
                {row.member === user.name ? " · you" : ""}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {row.ranked} of {row.submitted} {row.submitted === 1 ? "pick" : "picks"} ranked
              </p>
            </div>
            <p className="font-heading text-2xl tabular-nums">{row.value == null ? "–" : row.value.toFixed(1)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
