import Link from "next/link"
import { formatScore } from "@/lib/format"
import {
  AFTER_REMOVAL,
  BEA_PREFER_NEW,
  BEA_TOO_TOUGH,
  BELI_BANDS,
  BELI_BOARD,
  BELI_COMMUNITY,
  beliTenths,
  CAM_LIST,
  LANTERN,
} from "@/lib/how-beli-example"
import {
  blend,
  NIGHT_BUS,
  ROOFTOP,
  ROOFTOP_CAM_EDIT,
  ROOFTOP_EDITED_RESULT,
  ROOFTOP_RESULT,
  scoreOf,
} from "@/lib/how-example"

export const metadata = { title: "How it works" }

const STEPS = [
  {
    title: "Suggest whenever",
    body: "Add a movie any time it occurs to you. A few can be waiting at once. There is no weekly slot, and nobody has to wait their turn.",
  },
  {
    title: "Score it after you watch",
    body: "If you didn't suggest it, leave two scores from 1 to 10, halves included (7.5 is fine). Score the waiting movies in whatever order the group actually gets to them. You can change either score later. Once you save, the rest of the club can see them.",
  },
  {
    title: "The suggester sits out",
    body: "You don't score your own suggestion, even if you watched it with everyone else. The site won't save that. Your taste is never used to defend your own movie.",
  },
  {
    title: "One score puts it on the board",
    body: "Until someone scores it, it stays under Unwatched / up next and changes nothing. The first score gives it a spot. Scores that arrive later join that same movie. They don't start a new one.",
  },
]

const CONTENTS = [
  { href: "#flow", label: "The night" },
  { href: "#scores", label: "Two scores" },
  { href: "#moves", label: "Who moves" },
  { href: "#example", label: "An example" },
  { href: "#order", label: "Why order matters" },
  { href: "#faq", label: "Questions" },
  { href: "#beli", label: "Beli" },
  { href: "#beli-buckets", label: "Buckets" },
  { href: "#beli-questions", label: "The questions" },
  { href: "#beli-score", label: "The 0–10" },
  { href: "#beli-example", label: "A Beli example" },
]

function gap(movieEnjoy: number, movieFilm: number, olderEnjoy: number, olderFilm: number): number {
  return blend(movieEnjoy, movieFilm) - blend(olderEnjoy, olderFilm)
}

export default function HowPage() {
  const camBus = scoreOf(NIGHT_BUS, "Cam")
  const deeBus = scoreOf(NIGHT_BUS, "Dee")
  const camRoof = scoreOf(ROOFTOP, "Cam")
  const deeRoof = scoreOf(ROOFTOP, "Dee")
  const camGap = gap(camRoof.enjoy, camRoof.film, camBus.enjoy, camBus.film)
  const deeGap = gap(deeRoof.enjoy, deeRoof.film, deeBus.enjoy, deeBus.film)
  const editedCamGap = gap(ROOFTOP_CAM_EDIT.enjoy, ROOFTOP_CAM_EDIT.film, camBus.enjoy, camBus.film)
  const editedGap = (editedCamGap + deeGap) / 2

  return (
    <article className="mx-auto max-w-3xl space-y-12">
      <header className="space-y-4">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">The rules we actually use</p>
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Two honest scores, then a small argument</h1>
        <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
          The club keeps two rankings. Each has its own movie list and its own scores. This half of the page is the Elo
          board. Anyone can suggest a movie whenever. After you watch it, everyone except the person who suggested it
          leaves two scores. Those scores don&apos;t crown the film. They nudge the people who pick.{" "}
          <a href="#beli" className="text-primary underline-offset-4 hover:underline">
            Beli
          </a>{" "}
          is the other list, further down.
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

      <section id="flow" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">The night itself</h2>
        <ol className="space-y-0">
          {STEPS.map((step, index) => (
            <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
              <div className="flex flex-col items-center" aria-hidden>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg text-primary-foreground">
                  {index + 1}
                </span>
                {index < STEPS.length - 1 ? <span className="my-1 w-px flex-1 bg-border" /> : null}
              </div>
              <div className={index < STEPS.length - 1 ? "pb-6" : undefined}>
                <h3 className="font-heading text-xl leading-tight">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/80">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="scores" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">Why there are two scores</h2>
        <p className="text-sm leading-relaxed">
          A wonderful night and a wonderful film are different compliments. The club asks both, so you don&apos;t have
          to pretend they&apos;re the same thing.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Score one</p>
            <h3 className="mt-1 font-heading text-2xl leading-tight">How much did you enjoy watching it?</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The night itself: the laughs, the slump, the company, the runtime. A fun mess can score high here.
            </p>
          </div>
          <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Score two</p>
            <h3 className="mt-1 font-heading text-2xl leading-tight">How good is the movie, actually?</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The answer you&apos;d give a friend who wasn&apos;t there. A brilliant slog can score high here even when
              the evening was work.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed">
          For each person, the ranking takes a plain average of the two. An 8 for the night and a 6 for the film
          become a 7. Enjoyment and quality count equally. That blend is what gets compared. The two raw numbers stay
          saved, so a later change of heart can edit either one.
        </p>
        <p className="text-sm leading-relaxed">
          The movie list also shows &quot;Avg enjoyed&quot; and &quot;Avg film.&quot; Those are ordinary averages, a
          glance at how the night looked. The board does not rank anyone by them. It never asks whether the club&apos;s
          average was a 7. It asks, person by person, which of two movies they scored came out ahead.
        </p>
      </section>

      <section id="moves" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">Who gains, and who loses</h2>
        <p className="text-sm leading-relaxed">
          The board ranks members. Everyone starts at 1500, and 1500 stays the middle, because a point gained by one
          person is a point lost by another. Generous scoring doesn&apos;t inflate the club, and harsh scoring
          doesn&apos;t shrink it.
        </p>
        <ul className="space-y-3">
          {[
            ["Your latest scored movie defends you.", "It stays up until a newer suggestion of yours gets a score. An unscored suggestion doesn't take its place, and a movie doesn't retire for being old."],
            ["A newly scored movie plays each defender.", "One comparison per other member who already has a movie up. The suggester's change is the sum. Each other person moves only from their own movie."],
            ["Judges are people who scored both.", "The two suggesters are left out, and so is anyone who missed either film. Each judge contributes the gap between their two blends. Those gaps are averaged."],
            ["Points swap. Judges don't pocket them.", "If the new movie comes out ahead of what's expected, the suggester gains and the defender loses the same amount. The people who only judged stay put. So does anyone who has never had a suggestion scored."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-accent px-4 py-4">
            <h3 className="font-heading text-xl">The expectation</h3>
            <p className="mt-2 text-sm leading-relaxed">
              Someone already ahead is supposed to bring a stronger movie just to break even. A one-point edge in the
              blend is exactly the win expected from a member 200 points higher, and then that comparison moves
              nothing. Win by more than expected, or win as the underdog, and points show up. Fall short of what was
              expected, even when judges still preferred your movie, and you give points up.
            </p>
          </div>
          <div className="rounded-2xl bg-accent px-4 py-4">
            <h3 className="font-heading text-xl">Whose say counts</h3>
            <p className="mt-2 text-sm leading-relaxed">
              Close to 1500, judges count about equally. A judge 400 points above 1500 counts twice as much as a judge
              on 1500, and then those weights are scaled so they add up for that one comparison. A harsh scorer and a
              generous one aren&apos;t a problem: only the gap between the two movies each person scored is kept.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every comparison for a movie uses the board as it stood before that movie. The changes land together. If
          nobody scored both films, that comparison is skipped. It is not recorded as a tie. One comparison can move
          at most 32 points. Most nights move a lot less.
        </p>
      </section>

      <section id="example" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">A made-up night</h2>
        <p className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed">
          Alex, Bea, Cam, and Dee are not in your club. Night Bus and Rooftop are fake titles. The arithmetic is the
          ranking this site actually runs, rounded to one decimal the way the board does. Everyone starts at 1500.
        </p>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">Alex suggests Night Bus</h3>
          <p className="text-sm leading-relaxed">
            Bea, Cam, and Dee score it. Nothing else has been scored, so there is nothing to play. Nobody moves. Night
            Bus simply starts defending Alex.
          </p>
          <ScoreTable rows={NIGHT_BUS.ratings} />
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">Bea suggests Rooftop, scored next</h3>
          <p className="text-sm leading-relaxed">
            Alex, Cam, and Dee score Rooftop. The only movie already up is Night Bus, so there is one comparison: Bea
            against Alex. Alex never scored Night Bus, and Bea doesn&apos;t score Rooftop, so neither of them judges
            it. Cam and Dee scored both, and both sit at 1500, so they count equally.
          </p>
          <ScoreTable rows={ROOFTOP.ratings} />
          <p className="text-sm leading-relaxed">
            Cam&apos;s blend is {formatScore(blend(camRoof.enjoy, camRoof.film))} for Rooftop and{" "}
            {formatScore(blend(camBus.enjoy, camBus.film))} for Night Bus, a gap of {signed(camGap)}. Dee&apos;s gap is{" "}
            {signed(deeGap)} as well. The comparison gap is {signed((camGap + deeGap) / 2)}.
          </p>
          <p className="text-sm leading-relaxed">
            A gap of one blended point is read as a win of about 76 out of 100, where 50 would be a tie. Bea and Alex
            were level, so 50 is what the board expected. That surprise, scaled by the 32-point cap on one comparison,
            is {ROOFTOP_RESULT.beaDelta} for Bea and the same amount off Alex.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
          <p className="text-center text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            The only comparison
          </p>
          <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <MatchSide
              kicker="New suggestion"
              movie={ROOFTOP.movie}
              person={ROOFTOP.suggester}
              delta={ROOFTOP_RESULT.beaDelta}
              after={ROOFTOP_RESULT.beaAfter}
              tone="up"
            />
            <div className="flex flex-col items-center justify-center gap-1 px-1 text-center">
              <span className="font-heading text-2xl text-primary">vs</span>
              <span className="max-w-40 text-xs leading-snug text-muted-foreground">
                Cam and Dee scored both. They split this say evenly.
              </span>
            </div>
            <MatchSide
              kicker="Already defending"
              movie={NIGHT_BUS.movie}
              person={NIGHT_BUS.suggester}
              delta={`-${ROOFTOP_RESULT.beaDelta.slice(1)}`}
              after={ROOFTOP_RESULT.alexAfter}
              tone="down"
            />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Cam stays at {ROOFTOP_RESULT.camAfter}. Dee stays at {ROOFTOP_RESULT.deeAfter}. Judging did not move them.
            The four of them still add up to 6000, which is 1500 each.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">If Cam edits Rooftop</h3>
          <p className="text-sm leading-relaxed">
            Cam changes Rooftop from {camRoof.enjoy} and {camRoof.film} to {ROOFTOP_CAM_EDIT.enjoy} and{" "}
            {ROOFTOP_CAM_EDIT.film}. The blend falls from {formatScore(blend(camRoof.enjoy, camRoof.film))} to{" "}
            {formatScore(blend(ROOFTOP_CAM_EDIT.enjoy, ROOFTOP_CAM_EDIT.film))}, which is {signed(editedCamGap)} against
            Cam&apos;s Night Bus score. Dee is still at {signed(deeGap)}. Averaged, the gap is {signed(editedGap)}, and
            the arrows reverse. Bea finishes at {ROOFTOP_EDITED_RESULT.beaAfter} ({ROOFTOP_EDITED_RESULT.beaDelta}).
            Alex finishes at {ROOFTOP_EDITED_RESULT.alexAfter}.
          </p>
          <p className="text-sm leading-relaxed">
            Rooftop stays the second movie in line. Editing does not move it to the end. If another movie had been
            first scored after Rooftop, that later movie would be replayed too, because the board it met has changed.
          </p>
        </div>
      </section>

      <section id="order" className="scroll-mt-6 space-y-3">
        <h2 className="font-heading text-2xl">Why the order matters a little</h2>
        <p className="text-sm leading-relaxed">
          The board doesn&apos;t store a running total. Whenever you open it, every scored movie is played again from
          the raw scores.
        </p>
        <p className="text-sm leading-relaxed">
          The order is when each movie got its first score, not when it was suggested. Suggesting Night Bus earlier
          would not matter if the group scored Rooftop first. Rooftop would take the field, and Night Bus would be the
          one walking into a comparison. A score someone adds weeks later, or an edit, uses the new numbers in that
          original spot. The first-score time is set once and left alone.
        </p>
        <p className="text-sm leading-relaxed">
          Order matters because a movie is only compared with whatever is already defending when its turn comes. Each
          member&apos;s defender, at that moment in the replay, is their most recently scored suggestion. The one
          before it steps off.
        </p>
        <p className="text-sm leading-relaxed">
          So if Cam had a scored movie between these two, Rooftop would also be compared with Cam&apos;s, and Cam could
          move. Score Cam&apos;s movie after Rooftop instead, and Cam&apos;s movie is the one that has to face both Alex
          and Bea. The scores can match and the comparisons still won&apos;t. It is not a prize for scoring faster. It
          only decides which film is still standing there.
        </p>
      </section>

      <section id="faq" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">Questions that come up</h2>
        <div className="space-y-5">
          <Faq
            q="Does skipping a movie hurt me?"
            a="No. There is no penalty for a blank score. You just aren't a judge of that film. Your own number can still move: if you already have a movie defending you, other people who scored both films compare the new one with yours, whether or not you scored the new one. Sitting out doesn't protect your movie, and it doesn't add an extra loss. You were never going to judge your own movie anyway. If you have never had a suggestion scored, you stay at 1500. Scoring other people doesn't move you, and skipping them doesn't either."
          />
          <Faq
            q="Can I game it?"
            a="You can't score your own suggestion. On someone else's movie, your numbers are used when that movie is compared with another movie you also scored. The comparison against your own movie is judged by other people, so the scores you type don't add or subtract points from you on that movie. Rating it low moves points from the suggester to the member whose movie you compared it with. Those points don't land on you. Editing an old score does rebuild the board from that movie forward, so later comparisons can shift, including ones your film plays. That still isn't a dial that pays you. The way up is suggesting movies the group prefers to what's already defending. Rating everything low isn't a trick either: only your gap between two movies is kept, so a personal scale of 5s and a personal scale of 9s can agree."
          />
          <Faq
            q="Why did I move when this wasn't my suggestion?"
            a="Your latest scored movie is still defending you, and the new one was compared with it. It keeps doing that until a newer suggestion of yours gets a score. A suggestion nobody has scored yet leaves the old one up."
          />
          <Faq
            q="Why did a scored movie change nothing?"
            a="Nothing was up to play, or nobody had scored both films in that comparison. The first scored movie in the club only takes the field. A skipped comparison is not a tie. With only two members this happens every time: the suggester can't score their own film, so there is never a third person to judge. The ranking wants at least three people for that reason."
          />
          <Faq
            q="What if I'm the only person who has scored it?"
            a="That's enough for the movie to join. Any comparison you can make, because you also scored the older movie, uses you as the only judge. Everyone else can add scores later, and the board replays with them included."
          />
          <Faq
            q="Can we delete a score or a movie?"
            a="Scores stay. Change the numbers if you want; there isn't a way to blank them back out. A movie that has scores stays in the log too. Before anyone scores it, the person who suggested it, or an admin, can remove it, and it leaves no trace on the board."
          />
          <Faq
            q="Do the movies get a ranking?"
            a="The board ranks the members. Open a movie to see the comparisons it caused. The averages on the list are just the averages."
          />
          <Faq
            q="What about someone who joins later?"
            a="They start at 1500. They can score from then on, which lets them judge those movies. They have no scores on the old ones, so they don't judge the past. Their number stays 1500 until a suggestion of theirs is scored and has something to play."
          />
        </div>
      </section>

      <BeliGuide />

      <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/leaderboard" className="text-primary underline-offset-4 hover:underline">
          See the Elo board
        </Link>
        <Link href="/beli" className="text-primary underline-offset-4 hover:underline">
          Open your Beli list
        </Link>
      </p>
    </article>
  )
}

function BeliGuide() {
  const liked = BELI_BANDS.liked
  const fine = BELI_BANDS.fine
  const disliked = BELI_BANDS.disliked
  const beaNightBus = BEA_PREFER_NEW[1].score
  const camNightBus = CAM_LIST[0].score
  const nightBusAverage = ((beaNightBus + camNightBus) / 2).toFixed(2)

  return (
    <>
      <header id="beli" className="scroll-mt-6 space-y-4 border-t border-border pt-4">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">The other ranking</p>
        <h2 className="font-heading text-4xl tracking-tight sm:text-5xl">Sort the movies, then read the average</h2>
        <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
          Beli is a separate game from the Elo board. It has its own tab, its own movies, and its own scores. An Elo
          score leaves your Beli list where it was. A Beli ranking leaves the Elo board where it was.
        </p>
      </header>

      <section className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">What the two are for</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Elo board</p>
            <h3 className="mt-1 font-heading text-2xl leading-tight">Who is picking well</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Two scores per movie, then a small argument between films. Points move from one member to another. The
              movies on that list are the suggestions under Movies.
            </p>
          </div>
          <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Beli</p>
            <h3 className="mt-1 font-heading text-2xl leading-tight">Where each movie sits for you</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              You sort other people&apos;s picks into your own list. Each movie gets a 0–10 from that spot, the club
              averages those, and the Beli leaderboard scores the person who added the film.
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed">
          Adding a movie on Beli puts it on the Beli list only. Everyone else can rank it. You rank theirs. Your own
          pick stays off your list, so the number next to your name is what the rest of the club thought of your taste.
        </p>
      </section>

      <section id="beli-buckets" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">Liked, Fine, or Didn&apos;t like</h2>
        <p className="text-sm leading-relaxed">
          Ranking starts by sorting the movie into a bucket. On your list, every Liked movie sits above every Fine one,
          and every Fine one sits above every Didn&apos;t like. The scores keep that order: the lowest Liked score is{" "}
          {beliTenths(liked.bottom)}, and the highest Fine score is {beliTenths(fine.top)}.
        </p>
        <BandTable />
        <p className="text-sm leading-relaxed">
          A movie alone in its bucket gets the middle of the band: {beliTenths(liked.alone)} for Liked,{" "}
          {beliTenths(fine.alone)} for Fine, {beliTenths(disliked.alone)} for Didn&apos;t like. The first movie in a
          bucket takes that middle. It waits for company before anyone can be a {beliTenths(liked.top)}.
        </p>
      </section>

      <section id="beli-questions" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">Which did you like more?</h2>
        <p className="text-sm leading-relaxed">
          An empty bucket asks nothing. There is nobody to compare, and the movie takes the middle of the band. Once
          the bucket has other movies, the next screen is a question. One card is the movie you are placing. The other
          is one you already ranked in that same bucket. Comparisons stay inside the bucket. A Liked movie is only held
          up against other Liked movies.
        </p>
        <ul className="space-y-3">
          {[
            [
              "The new movie",
              "You liked the one you are placing more. It belongs above the movie on the card, so that movie and everything below it drop out. If any movies are still above it, the next question is about those.",
            ],
            [
              "The one already ranked",
              "You liked the movie already on your list more. The new one belongs below it, so that movie and everything above it drop out. If any movies are still below it, the next question is about those.",
            ],
            [
              "Too tough to call",
              "The questions stop. The new movie lands just under the one it was compared with. You can re-rank later if that spot feels wrong.",
            ],
            [
              "Back",
              "One step back to the previous question. The button stays quiet until you have answered one.",
            ],
            [
              "Start over",
              "The unfinished questions are dropped and the three buckets come back. A movie you have not finished placing stays off your list. If you were re-ranking, the saved score stays. The club keeps one unfinished ranking for you, so you can leave and pick it up. Starting a different movie clears that unfinished one too.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Each answer cuts the movies still in play about in half, so a long bucket stays a few questions.
        </p>
      </section>

      <section id="beli-score" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">How a place becomes a 0–10</h2>
        <p className="text-sm leading-relaxed">
          You never type the score. It comes from the bucket and from how many movies sit above it in that bucket. With
          two or more, the top movie gets the top of the band and the bottom movie gets the bottom. Movies between them
          are spaced in equal steps, then rounded to a tenth. Two Liked movies are {beliTenths(liked.top)} and{" "}
          {beliTenths(liked.bottom)}. Two Fine movies are {beliTenths(fine.top)} and {beliTenths(fine.bottom)}. Two you
          didn&apos;t like are {beliTenths(disliked.top)} and {beliTenths(disliked.bottom)}.
        </p>
        <p className="text-sm leading-relaxed">
          Those numbers describe the list as it is now. Place something new above a movie and the older one steps down.
          Remove one and the rest close up. A {beliTenths(liked.top)} means it is your favorite of the Liked ones today.
        </p>
        <h3 className="font-heading text-xl">The community score</h3>
        <p className="text-sm leading-relaxed">
          Open a Beli movie and the big number is the community score: the average of every member&apos;s score for it,
          rounded to one decimal. A 5 in the next place rounds up. Until someone ranks it, there is no community score.
          The person who added the movie has no score in that average, because they never rank their own pick.
        </p>
        <h3 id="beli-board" className="scroll-mt-6 font-heading text-xl">
          The Beli leaderboard
        </h3>
        <p className="text-sm leading-relaxed">
          Members are ordered by the average community score of the movies they added, counting only movies someone has
          ranked. That average is rounded to a tenth the same way. A pick nobody has ranked yet stays out of the
          average. If none of your picks have been ranked, your spot is blank and sits at the bottom. The same average
          puts the person with more ranked picks higher. If the counts match too, the name that comes first is higher.
        </p>
        <p className="text-sm leading-relaxed">
          You can&apos;t rank your own pick. The rank page won&apos;t start, and your name never shows up among the
          people who scored your movie. The leaderboard is measuring your picks, not how generously you score your
          friends.
        </p>
      </section>

      <section id="beli-example" className="scroll-mt-6 space-y-4">
        <h2 className="font-heading text-2xl">A made-up Beli list</h2>
        <p className="rounded-xl bg-accent px-4 py-3 text-sm leading-relaxed">
          Alex, Bea, and Cam are not in your club. {NIGHT_BUS.movie}, {ROOFTOP.movie}, and {LANTERN} are fake titles.
          The scores are what this site&apos;s Beli ranking actually returns, shown to one decimal the way the Beli
          pages do.
        </p>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">Bea ranks {NIGHT_BUS.movie}, then {LANTERN}</h3>
          <p className="text-sm leading-relaxed">
            Alex added {NIGHT_BUS.movie}. Bea puts it in Liked. The bucket is empty, so there is no question, and the
            score is {beliTenths(liked.alone)}.
          </p>
          <p className="text-sm leading-relaxed">
            Cam added {LANTERN}. Bea puts that in Liked too. The only question is {LANTERN} against {NIGHT_BUS.movie}.
            She likes {LANTERN} more. {LANTERN} takes the top of the band at {beliTenths(BEA_PREFER_NEW[0].score)}, and{" "}
            {NIGHT_BUS.movie} steps down to {beliTenths(BEA_PREFER_NEW[1].score)}.
          </p>
          <PlaceList rows={BEA_PREFER_NEW} caption="Bea's Liked list after she prefers Lantern" />
          <p className="text-sm leading-relaxed">
            Too tough to call on that same question would stop immediately and place {LANTERN} just under{" "}
            {NIGHT_BUS.movie}. {NIGHT_BUS.movie} would be {beliTenths(BEA_TOO_TOUGH[0].score)}, and {LANTERN} would be{" "}
            {beliTenths(BEA_TOO_TOUGH[1].score)}.
          </p>
          <PlaceList rows={BEA_TOO_TOUGH} caption="The same bucket if Bea calls it too tough" />
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">Cam ranks both, in different buckets</h3>
          <p className="text-sm leading-relaxed">
            Cam puts {NIGHT_BUS.movie} in Liked, alone, at {beliTenths(CAM_LIST[0].score)}. He puts {ROOFTOP.movie},
            which Bea added, in Fine. That bucket is empty too, so {ROOFTOP.movie} is {beliTenths(CAM_LIST[1].score)}{" "}
            and no question is asked. Fine never mixes into the Liked comparisons, and on Cam&apos;s list the Liked
            movie still sits above the Fine one.
          </p>
          <PlaceList
            rows={CAM_LIST.map((row) => ({ movie: `${row.movie} · ${row.bucket}`, score: row.score }))}
            caption="Cam's list, best first"
          />
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">The club&apos;s numbers</h3>
          <p className="text-sm leading-relaxed">
            {NIGHT_BUS.movie} has two scores, Bea&apos;s {beliTenths(beaNightBus)} and Cam&apos;s{" "}
            {beliTenths(camNightBus)}. The average is {nightBusAverage}, which rounds to a community score of{" "}
            {beliTenths(BELI_COMMUNITY.nightBus)}. {LANTERN} has only Bea, so its community score stays{" "}
            {beliTenths(BELI_COMMUNITY.lantern)}. {ROOFTOP.movie} has only Cam, so it stays{" "}
            {beliTenths(BELI_COMMUNITY.rooftop)}. Alex, Bea, and Cam are each missing from the movie they added.
          </p>
          <p className="text-sm leading-relaxed">
            The Beli leaderboard reads those community scores as the picker&apos;s result. {BELI_BOARD[0].member} is at{" "}
            {beliTenths(BELI_BOARD[0].score)} from {LANTERN}. {BELI_BOARD[1].member} is at{" "}
            {beliTenths(BELI_BOARD[1].score)} from {NIGHT_BUS.movie}. {BELI_BOARD[2].member} is at{" "}
            {beliTenths(BELI_BOARD[2].score)} from {ROOFTOP.movie}. Each of them added one movie that someone ranked, so
            the leaderboard number is that movie&apos;s community score.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl">Re-rank, or take it off your list</h3>
          <p className="text-sm leading-relaxed">
            Re-rank asks for a bucket again, then the questions. The movie is held out of its own comparisons, so Bea
            re-ranking {NIGHT_BUS.movie} would be asked about {LANTERN}, and never about {NIGHT_BUS.movie} itself. The
            saved score stays until she finishes. Start over in the middle leaves that saved score alone.
          </p>
          <p className="text-sm leading-relaxed">
            Remove from my list drops the movie from your ranking. The others in that bucket close up and the scores
            are worked out again. The movie stays on the club&apos;s Beli list, and everyone else&apos;s rankings of it
            stay. If Bea removes {LANTERN}, {NIGHT_BUS.movie} is alone in Liked again and her score returns to{" "}
            {beliTenths(AFTER_REMOVAL.beaNightBus)}. Cam still has it at {beliTenths(camNightBus)}, so the community
            score is {beliTenths(AFTER_REMOVAL.communityNightBus)} and Alex&apos;s leaderboard number is{" "}
            {beliTenths(AFTER_REMOVAL.alex)}. {LANTERN} has no rankings left, so its community score disappears and
            Cam&apos;s spot goes blank. Bea stays at {beliTenths(AFTER_REMOVAL.bea)} from {ROOFTOP.movie}.
          </p>
        </div>
      </section>
    </>
  )
}

function BandTable() {
  const columns = [
    ["On its own", "alone"],
    ["Top of a longer bucket", "top"],
    ["Bottom of a longer bucket", "bottom"],
  ] as const
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">Score bands for Liked, Fine, and Didn&apos;t like</caption>
        <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Bucket
            </th>
            {columns.map(([label]) => (
              <th key={label} scope="col" className="px-2 py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.values(BELI_BANDS).map((band) => (
            <tr key={band.label} className="border-t border-border">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                {band.label}
              </th>
              {columns.map(([, key]) => (
                <td key={key} className="px-2 py-2 tabular-nums">
                  {beliTenths(band[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlaceList({ rows, caption }: { rows: readonly { movie: string; score: number }[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
      <table className="w-full min-w-[18rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Place
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Movie
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${caption}-${row.movie}`} className="border-t border-border">
              <td className="px-4 py-2 tabular-nums">{index + 1}</td>
              <th scope="row" className="px-2 py-2 text-left font-medium">
                {row.movie}
              </th>
              <td className="px-4 py-2 tabular-nums">{beliTenths(row.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreTable({ rows }: { rows: { name: string; enjoy: number; film: number }[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
      <table className="w-full min-w-[20rem] text-sm">
        <caption className="sr-only">Enjoyment, film, and the blend the ranking uses</caption>
        <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Who
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Enjoyed
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              The film
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Blend
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-border">
              <th scope="row" className="px-4 py-2 text-left font-medium">
                {row.name}
              </th>
              <td className="px-2 py-2 tabular-nums">{formatScore(row.enjoy)}</td>
              <td className="px-2 py-2 tabular-nums">{formatScore(row.film)}</td>
              <td className="px-4 py-2 tabular-nums">{formatScore(blend(row.enjoy, row.film))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatchSide({
  kicker,
  movie,
  person,
  delta,
  after,
  tone,
}: {
  kicker: string
  movie: string
  person: string
  delta: string
  after: string
  tone: "up" | "down"
}) {
  return (
    <div className={tone === "up" ? "rounded-xl bg-accent px-4 py-3 text-center" : "rounded-xl bg-muted px-4 py-3 text-center"}>
      <p className="text-xs text-muted-foreground">{kicker}</p>
      <p className="font-heading text-2xl leading-tight">{movie}</p>
      <p className="text-sm">{person}</p>
      <p className={tone === "up" ? "delta-up mt-1 font-medium tabular-nums" : "delta-down mt-1 font-medium tabular-nums"}>
        {delta}
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">now {after}</p>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="space-y-1">
      <h3 className="font-heading text-xl leading-tight">{q}</h3>
      <p className="text-sm leading-relaxed text-foreground/80">{a}</p>
    </div>
  )
}

function signed(value: number): string {
  if (value > 0) return `+${formatScore(value)}`
  return formatScore(value)
}
