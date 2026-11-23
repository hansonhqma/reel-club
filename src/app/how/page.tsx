import Link from "next/link"
import { UTR_BUCKET_LABELS, UTR_CHOICES, type UtrBucket } from "@/lib/utr-score"

const BAND_ROW: Record<UtrBucket, [string, string]> = {
  not_really: ["0–3.9", "2.0"],
  kinda: ["4.0–6.9", "5.5"],
  a_lot: ["7.0–10", "8.5"],
}

export const metadata = { title: "How it works" }

const CONTENTS = [
  { href: "#enjoy", label: "Enjoyment" },
  { href: "#comparisons", label: "Comparisons" },
  { href: "#scores", label: "Scores" },
  { href: "#one", label: "One movie" },
  { href: "#close", label: "Closing" },
  { href: "#rankings", label: "Rankings" },
  { href: "#ranks", label: "Ranks" },
]

export default function HowPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-12">
      <header className="space-y-4">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">The rules we actually use</p>
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">One movie, one honest group, then Rankings</h1>
        <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
          Reel Club keeps a single open movie. You say how much you enjoyed it, place it on your list, and Rankings
          catches up when that movie closes.
        </p>
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {CONTENTS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full bg-card px-3 py-1 text-sm ring-1 ring-foreground/10 hover:bg-accent"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <section id="enjoy" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">How much did you enjoy it?</h2>
        <p className="text-sm leading-relaxed">
          The first question has three answers: <span className="font-medium">Didn&apos;t like it</span>,{" "}
          <span className="font-medium">Just ok</span>, and <span className="font-medium">Loved it</span>. That choice is a
          group, not a number you type. Everything after it happens inside the group you picked.
        </p>
      </section>

      <section id="comparisons" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">Then a few comparisons, in that group only</h2>
        <p className="text-sm leading-relaxed">
          If you already have movies in that group, the site asks which you enjoyed more: the new one, or one already
          on your list. You always pick a side. Back steps to the previous question, and it stays quiet until you have
          answered one. Start over throws the draft away, including a slot you already saved, while the movie is still
          open.
        </p>
        <p className="text-sm leading-relaxed">
          An empty group needs no comparisons. The movie takes the middle of that band and your list updates right
          away. I didn&apos;t watch leaves it off your list. You can say that about a movie you suggested, too.
        </p>
      </section>

      <section id="scores" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">What the 0–10 scores mean</h2>
        <p className="text-sm leading-relaxed">
          Best first. Loved it always sits above Just ok, and Just ok always sits above Didn&apos;t like it. Inside a group the scores
          spread from the top of the band to the bottom.
        </p>
        <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[18rem] text-sm">
            <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Group</th>
                <th className="px-2 py-2 font-medium">Band</th>
                <th className="px-4 py-2 font-medium">Alone</th>
              </tr>
            </thead>
            <tbody>
              {UTR_CHOICES.map((bucket) => {
                const [band, alone] = BAND_ROW[bucket]
                const group = UTR_BUCKET_LABELS[bucket]
                return (
                  <tr key={group} className="border-t border-border">
                    <th className="px-4 py-2 text-left font-medium">{group}</th>
                    <td className="px-2 py-2 tabular-nums">{band}</td>
                    <td className="px-4 py-2 tabular-nums">{alone}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed">
          A movie alone in its group gets 8.5, 5.5, or 2.0. A second movie in that group spreads the scores, so an old
          8.5 can move. The number on your list changes as soon as the slot is saved. It does not wait for Rankings.
          Movies shows a group score: the average of those current scores, leaving out the suggester and anyone who
          didn&apos;t watch. When nobody else has rated, the card shows a dash. The suggester&apos;s own score is listed
          with the others and marked as their pick. Until you answer the open movie, you see who is done, not the scores.
        </p>
      </section>

      <section id="one" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">One movie at a time</h2>
        <p className="text-sm leading-relaxed">
          Suggesting another title is refused while one is open. The open movie stays at the top of Rate, with who has
          answered and who is still to go. There is no queue of several unwatched films.
        </p>
      </section>

      <section id="close" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">When a movie closes</h2>
        <p className="text-sm leading-relaxed">
          It closes on its own once every active member has rated it or said they didn&apos;t watch. The person who
          suggested it, or an admin, can close it early. Closing asks you to confirm, because anyone still silent is
          stored as didn&apos;t watch. There is no timer. After close, that movie can&apos;t be edited.
        </p>
      </section>

      <section id="rankings" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">What Rankings is doing</h2>
        <p className="text-sm leading-relaxed">
          You rate a movie you suggested, and that score stays on your list. It is left out of the Elo for that movie,
          so you don&apos;t grade your own pick. If nobody except the suggester rated it, the movie does not enter
          Rankings at all.
        </p>
        <p className="text-sm leading-relaxed">
          Every close rebuilds Elo from the lists as they stand, using those 0–10 scores. The change since the previous
          close has two parts, labeled on Rankings. <span className="font-medium">new movie</span> is this close
          itself. <span className="font-medium">re-sorted</span> is earlier movies whose scores shifted because the
          lists changed. Those two parts add up to the change you see.
        </p>
        <p className="text-sm leading-relaxed">
          The first closed movie doesn&apos;t play anyone. There is nothing earlier to compare it with, so everyone
          stays at 1500, Silver II, until a second movie closes. Before any movie has closed, Rankings is that same
          starting line. Each person can open their picks. A closed pick shows the Elo it added for them, the new-movie
          part of that close. An open pick says Open. A pick nobody else scored shows 0. Those changes add up next to
          the re-sorted total from every close.
        </p>
        <p className="text-sm">
          <Link href="/rankings" className="text-primary underline-offset-4 hover:underline">
            See Rankings
          </Link>
        </p>
      </section>

      <section id="ranks" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">Ranks</h2>
        <p className="text-sm leading-relaxed">
          A rank is a label on your Elo. Everyone starts at <span className="font-medium">Silver II</span>. You step up
          the moment your Elo crosses the next line. You step down only after your Elo is 10 points below the line you
          are holding, so a short dip does not knock you down. The crest remembers that, which is why the label is not
          just a lookup of tonight&apos;s number.
        </p>
        <p className="text-sm leading-relaxed">
          Iron through Diamond have four divisions, IV up to I. Master has no division. The floors are Iron below 1120,
          then Bronze 1240, Silver 1400, Gold 1560, Platinum 1720, Emerald 1800, Diamond 1920, and Master 2080. Silver
          II, the start, is 1480 to 1519.
        </p>
        <p className="text-sm leading-relaxed">
          Challenger and Grandmaster are chairs, not score lines. A rated pick is a movie you suggested that at least
          one other member scored.
        </p>
        <ul className="space-y-2 text-sm leading-relaxed">
          <li>
            <span className="font-medium">Challenger</span> is only the current number 1, and only with Elo of at least
            1800 and at least 6 rated picks.
          </li>
          <li>
            <span className="font-medium">Grandmaster</span> is only the current number 2, and only while someone is
            Challenger, with Elo of at least 1720 and at least 6 rated picks.
          </li>
          <li>If the leader is not there yet, both chairs stay empty. Second place does not become Challenger.</li>
          <li>A tie breaks by name, A to Z.</li>
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The crests are League of Legends ranked emblems. Reel Club isn&apos;t endorsed by Riot Games and doesn&apos;t
          reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of
          Legends.
        </p>
      </section>
    </article>
  )
}
