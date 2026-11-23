import Link from "next/link"
import { Delta } from "@/components/delta"
import { RankEmblem, STARTING_RANK } from "@/components/rank-emblem"
import { HOW_STORY } from "@/lib/how-story"
import { DEMOTION_BUFFER, rankFloor, type UtrRank } from "@/lib/utr-ranks"

export const metadata = { title: "How it works" }

const SILVER_II_FLOOR = rankFloor(STARTING_RANK.label) ?? 1480
const DROP_BELOW = SILVER_II_FLOOR - DEMOTION_BUFFER

const CONTENTS = [
  { href: "#suggest", label: "Suggest" },
  { href: "#rate", label: "Rate" },
  { href: "#close", label: "Close" },
  { href: "#rankings", label: "Rankings" },
  { href: "#ranks", label: "Ranks" },
  { href: "#movies", label: "Movies" },
]

const GROUPS = [
  { label: "Didn't like it", band: "0–3.9", alone: HOW_STORY.alone.disliked },
  { label: "Just ok", band: "4.0–6.9", alone: HOW_STORY.alone.justOk },
  { label: "Loved it", band: "7.0–10", alone: HOW_STORY.alone.loved },
] as const

const LADDER: { rank: UtrRank; note: string; here?: boolean }[] = [
  { rank: { tier: "Iron", division: "IV", label: "Iron IV" }, note: "under 1120" },
  { rank: { tier: "Bronze", division: "IV", label: "Bronze IV" }, note: "1240" },
  { rank: STARTING_RANK, note: "1480 · you start here", here: true },
  { rank: { tier: "Gold", division: "IV", label: "Gold IV" }, note: "1560" },
  { rank: { tier: "Platinum", division: "IV", label: "Platinum IV" }, note: "1720" },
  { rank: { tier: "Emerald", division: "IV", label: "Emerald IV" }, note: "1800" },
  { rank: { tier: "Diamond", division: "IV", label: "Diamond IV" }, note: "1920" },
  { rank: { tier: "Master", division: null, label: "Master" }, note: "2080" },
  { rank: { tier: "Grandmaster", division: null, label: "Grandmaster" }, note: "#2 seat" },
  { rank: { tier: "Challenger", division: null, label: "Challenger" }, note: "#1 seat" },
]

export default function HowPage() {
  const story = HOW_STORY
  return (
    <article className="mx-auto max-w-3xl space-y-14">
      <header className="space-y-4">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">A made-up club</p>
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Ana, Ben, Cam, and Dee go to the movies</h1>
        <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
          Two nights, four friends. They are not in your club. The scores use the same math as the app.
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

      <section id="suggest" className="scroll-mt-6 space-y-4">
        <Step n={1} title="Ana suggests one movie" />
        <p className="max-w-xl text-sm leading-relaxed">
          She opens <span className="font-medium">Paper Moon</span>. One movie at a time. Ben, Cam, and Dee cannot
          suggest anything until this one closes.
        </p>
        <MovieCard title="Paper Moon" who="Ana" status="Open" />
      </section>

      <section id="rate" className="scroll-mt-6 space-y-4">
        <Step n={2} title="They say how it felt" />
        <p className="max-w-xl text-sm leading-relaxed">First, pick a group. Worst on the left, best on the right.</p>
        <div id="groups" className="grid grid-cols-3 gap-2">
          {GROUPS.map((group) => (
            <div key={group.label} className="rounded-2xl bg-card px-3 py-4 text-center ring-1 ring-foreground/10">
              <p className="font-heading text-xl leading-tight sm:text-2xl">{group.label}</p>
            </div>
          ))}
        </div>
        <p className="max-w-xl text-sm leading-relaxed">
          Then, only if that group already has movies: pick the one you enjoyed more. I didn&apos;t watch leaves it off
          your list.
        </p>
        <p className="max-w-xl text-sm leading-relaxed">
          A movie alone in its group sits in the middle of the band.
        </p>
        <ul className="grid gap-2 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <li key={group.band} className="rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
              <p className="text-sm font-medium">{group.label}</p>
              <p className="mt-1 font-heading text-2xl tabular-nums">{group.alone}</p>
              <p className="text-sm text-muted-foreground">alone in {group.band}</p>
            </li>
          ))}
        </ul>
        <p className="max-w-xl text-sm leading-relaxed">
          Dee&apos;s Just ok list starts with only Paper Moon, so it is {story.alone.justOk}. She later adds The Long
          Table and still prefers Paper Moon. The two scores spread to the ends of 4.0–6.9.
        </p>
        <div id="list" className="space-y-2">
          <ListRow title="Paper Moon" group="Just ok" score={story.justOkPair.top} />
          <ListRow title="The Long Table" group="Just ok" score={story.justOkPair.bottom} />
        </div>
      </section>

      <section id="close" className="scroll-mt-6 space-y-4">
        <Step n={3} title="The night closes" />
        <p className="max-w-xl text-sm leading-relaxed">
          Paper Moon closes when Ana, Ben, Cam, and Dee have all answered. Ana, or an admin, can close it early.
          Anyone still silent counts as didn&apos;t watch. After close, those answers stay put.
        </p>
      </section>

      <section id="rankings" className="scroll-mt-6 space-y-4">
        <Step n={4} title="Elo scores the picks" />
        <p className="max-w-xl text-sm leading-relaxed">
          Elo is a score for how good your picks are. Everyone starts at {story.startElo}.
        </p>
        <p className="max-w-xl text-sm leading-relaxed">
          Paper Moon is the first movie, so it has nothing earlier to play. All four stay at {story.startElo}.
        </p>
        <p className="max-w-xl text-sm leading-relaxed">
          Ben suggests The Long Table. Cam scores it {story.alone.loved} and Paper Moon {story.alone.justOk}. Dee
          scores Paper Moon {story.justOkPair.top} and The Long Table {story.justOkPair.bottom}. They split, so the
          move is small. Ben&apos;s own rating does not count.
        </p>
        <ul className="space-y-2">
          <EloRow name="Ana" before={story.startElo} after={story.afterLongTable.Ana} change={story.newMovie.Ana} />
          <EloRow name="Ben" before={story.startElo} after={story.afterLongTable.Ben} change={story.newMovie.Ben} />
          <EloRow name="Cam" before={story.startElo} after={story.afterLongTable.Cam} change={story.newMovie.Cam} />
          <EloRow name="Dee" before={story.startElo} after={story.afterLongTable.Dee} change={story.newMovie.Dee} />
        </ul>
        <p className="max-w-xl text-sm leading-relaxed">
          <span className="font-medium">new movie</span> is this night&apos;s match.{" "}
          <span className="font-medium">re-sorted</span> is an older night played again because a list score moved.
          This night, re-sorted is 0.0.
        </p>
        <p className="max-w-xl text-sm leading-relaxed">
          Later, Dee&apos;s Paper Moon slips from {story.justOkPair.top} to {story.alone.justOk}. The old match is
          replayed. re-sorted is Ana {story.reSortedLater.Ana} and Ben {story.reSortedLater.Ben}.
        </p>
        <p className="text-sm">
          <Link href="/rankings" className="text-primary underline-offset-4 hover:underline">
            See Rankings
          </Link>
        </p>
      </section>

      <section id="ranks" className="scroll-mt-6 space-y-4">
        <Step n={5} title="Crests sit on that score" />
        <p className="max-w-xl text-sm leading-relaxed">
          You start at <span className="font-medium">Silver II</span>, from {SILVER_II_FLOOR}. You step up
          the moment you cross the next line. You drop only after you fall {DEMOTION_BUFFER} below the line you hold.
          Ana&apos;s {story.afterLongTable.Ana} is still Silver II. She would have to go below {DROP_BELOW}.
        </p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {LADDER.map((step) => (
            <li
              key={step.rank.label}
              className={
                step.here
                  ? "rounded-2xl bg-primary/10 px-2 py-3 ring-1 ring-primary/30"
                  : "rounded-2xl bg-card px-2 py-3 ring-1 ring-foreground/10"
              }
            >
              <RankEmblem rank={step.rank} size="sm" showLabel={false} />
              <p className="mt-1 text-sm font-medium leading-tight">{step.rank.label}</p>
              <p className="text-xs text-muted-foreground">{step.note}</p>
            </li>
          ))}
        </ul>
        <p className="max-w-xl text-sm leading-relaxed">
          Inside a tier the divisions run IV, III, II, I. Challenger is only the #1 seat: Elo at least 1800 and at
          least 6 rated picks. Grandmaster is only #2, and only while someone is Challenger: Elo at least 1720 and at
          least 6 rated picks. If the leader is not there yet, both seats stay empty.
        </p>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          The crests are League of Legends ranked emblems. Reel Club isn&apos;t endorsed by Riot Games and doesn&apos;t
          reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of
          Legends.
        </p>
      </section>

      <section id="movies" className="scroll-mt-6 space-y-4">
        <Step n={6} title="Movies shows the group, not your own grade" />
        <p className="max-w-xl text-sm leading-relaxed">
          The group score is the average of the other people&apos;s current scores. The suggester is left out. So is
          anyone who didn&apos;t watch.
        </p>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-heading text-2xl">Paper Moon</p>
              <p className="text-sm text-muted-foreground">Ana</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">Closed</p>
              <p className="font-heading text-2xl tabular-nums">{story.groupScoreFirstNight}</p>
              <p className="text-sm text-muted-foreground">3 ratings</p>
            </div>
          </div>
          <ul className="mt-3 divide-y divide-border text-sm">
            <ScoreLine name="Ben" score="8.5" />
            <ScoreLine name="Cam" score="5.5" />
            <ScoreLine name="Dee" score="5.5" />
            <ScoreLine name="Ana" score="8.5" note="Her pick" />
          </ul>
        </div>
        <p className="max-w-xl text-sm leading-relaxed">
          That {story.groupScoreFirstNight} is Ben, Cam, and Dee. When Dee&apos;s score later moves to{" "}
          {story.justOkPair.top}, the average becomes {story.groupScoreAfterDeeMoves}. You see an open movie&apos;s
          scores only after you answer. On Rankings, each pick shows the Elo it added: the new-movie number from the
          night it closed.
        </p>
      </section>
    </article>
  )
}

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">
      <span className="text-primary">{n}.</span> {title}
    </h2>
  )
}

function MovieCard({ title, who, status }: { title: string; who: string; status: string }) {
  return (
    <div className="flex max-w-md items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div>
        <p className="font-heading text-2xl">{title}</p>
        <p className="text-sm text-muted-foreground">{who}</p>
      </div>
      <p className="text-xs font-medium tracking-wide text-primary uppercase">{status}</p>
    </div>
  )
}

function ListRow({ title, group, score }: { title: string; group: string; score: string }) {
  return (
    <div className="flex max-w-md items-center gap-3 rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-xl">{title}</p>
        <p className="text-sm text-muted-foreground">{group}</p>
      </div>
      <p className="font-heading text-2xl tabular-nums">{score}</p>
    </div>
  )
}

function EloRow({
  name,
  before,
  after,
  change,
}: {
  name: string
  before: string
  after: string
  change: string
}) {
  const value = Number(change)
  return (
    <li className="rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-xl">{name}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          {before}
          <span aria-hidden className="px-1">
            →
          </span>
          <span className="font-medium text-foreground">{after}</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(12, ((Number(after) - 1496) / 8) * 100))}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        <Delta value={value} /> new movie
        {" · "}
        <Delta value={0} /> re-sorted
      </p>
    </li>
  )
}

function ScoreLine({ name, score, note }: { name: string; score: string; note?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span>
        {name}
        {note ? <span className="text-muted-foreground"> · {note}</span> : null}
      </span>
      <span className="tabular-nums">{score}</span>
    </li>
  )
}
