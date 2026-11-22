import Link from "next/link"
import { redirect } from "next/navigation"
import { Delta } from "@/components/delta"
import { RankEmblem, STARTING_RANK } from "@/components/rank-emblem"
import { utrBoard, utrCloses } from "@/lib/utr"
import { utrActiveNames } from "@/lib/utr-roster"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Board" }

export default async function LeaderboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const closes = utrCloses()
  const board = utrBoard()
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
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">The board</p>
        <h1 className="mt-1 font-heading text-4xl tracking-tight">Who&apos;s picking well</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {board
            ? `These numbers are from after ${board.title} closed. Each change since the previous close splits into the new movie and older ratings that were re-sorted.`
            : "No movie has closed yet, so everyone is still at 1500, which is Silver II."}{" "}
          <Link href="/how" className="text-primary underline-offset-4 hover:underline">
            How this works
          </Link>
        </p>
      </div>

      {closes.length === 0 ? (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed">
          The board waits for a movie to close. Rating updates your list immediately, and Elo waits until then.
        </p>
      ) : null}
      {closes.length === 1 ? (
        <p className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed">
          {board?.title} was the first movie to close, so it only took the field. Nobody&apos;s number moved. Everyone
          stays at 1500, Silver II, until a second movie closes.
        </p>
      ) : null}

      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.name} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
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
                  <Delta value={row.fromNew} /> from the new movie
                  {" · "}
                  <Delta value={row.fromOlder} /> older ratings re-sorted
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Starting score</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-heading text-2xl tabular-nums">{row.elo.toFixed(1)}</p>
              {board && closes.length > 1 ? <Delta value={row.change} className="text-sm" /> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
