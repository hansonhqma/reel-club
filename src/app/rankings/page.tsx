import Link from "next/link"
import { redirect } from "next/navigation"
import { Delta } from "@/components/delta"
import { Disclosure } from "@/components/disclosure"
import { RankEmblem, STARTING_RANK } from "@/components/rank-emblem"
import { utrPicksBySuggester } from "@/lib/utr-catalog"
import { utrBoard, utrCloses } from "@/lib/utr"
import { utrActiveNames } from "@/lib/utr-roster"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Rankings" }

export default async function RankingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const closes = utrCloses()
  const board = utrBoard()
  const picks = utrPicksBySuggester(user.id)
  const rows = board
    ? board.rows.map((row) => ({ ...row, change: row.fromNew + row.fromOlder }))
    : utrActiveNames().map((name) => ({
        name,
        elo: 1500,
        fromNew: 0,
        fromOlder: 0,
        change: 0,
        rank: STARTING_RANK,
        ratedPicks: 0,
      }))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-4xl tracking-tight">Rankings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tap a name.{" "}
          <Link href="/how" className="text-primary underline-offset-4 hover:underline">
            How this works
          </Link>
        </p>
      </div>
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const mine = picks.get(row.name) ?? { picks: [], picksNet: 0, reSorted: 0 }
          return (
            <li key={row.name}>
              <Disclosure
                summary={
                  <div className="flex items-center gap-3">
                    <span className="w-8 text-center font-heading text-2xl tabular-nums text-primary">{index + 1}</span>
                    <RankEmblem rank={row.rank} showLabel={false} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-xl leading-tight">
                        {row.name}
                        {row.name === user.name ? " · you" : ""}
                      </p>
                      <p className="text-sm font-medium">{row.rank.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.ratedPicks} {row.ratedPicks === 1 ? "rated pick" : "rated picks"}
                      </p>
                      {board && closes.length > 1 ? (
                        <p className="text-sm text-muted-foreground">
                          <Delta value={row.fromNew} /> new movie
                          {" · "}
                          <Delta value={row.fromOlder} /> re-sorted
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-heading text-2xl tabular-nums">{row.elo.toFixed(1)}</p>
                      {board && closes.length > 1 ? <Delta value={row.change} className="text-sm" /> : null}
                    </div>
                  </div>
                }
              >
                {mine.picks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No picks.</p>
                ) : (
                  <div className="space-y-3">
                    <ul className="divide-y divide-border">
                      {mine.picks.map((pick) => (
                        <li key={pick.movieId} className="flex items-center gap-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{pick.title}</p>
                            <p className="text-muted-foreground">{pick.status === "open" ? "Open" : "Closed"}</p>
                          </div>
                          <p className="tabular-nums text-muted-foreground">
                            {pick.revealed ? (pick.groupScore == null ? "—" : pick.groupScore.toFixed(1)) : ""}
                          </p>
                          {pick.impact == null ? (
                            <span className="text-muted-foreground">Open</span>
                          ) : (
                            <Delta value={pick.impact} />
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-muted-foreground">
                      <Delta value={mine.picksNet} /> picks
                      {" · "}
                      <Delta value={mine.reSorted} /> re-sorted
                    </p>
                  </div>
                )}
              </Disclosure>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
