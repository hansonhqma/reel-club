import assert from "node:assert/strict"
import fs from "node:fs"
import { test } from "node:test"
import React, { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

// The Next compiler rewrites JSX. This test runner leaves `React` free, so
// publish it before loading the page module.
globalThis.React = React
import { BeliBridgeError, beliRemove, beliStart, beliStep, beliView, type BeliState } from "../src/lib/beli-bridge.ts"
import { formatDelta, formatElo } from "../src/lib/format.ts"
import {
  AFTER_REMOVAL,
  BEA_PREFER_NEW,
  BEA_TOO_TOUGH,
  BELI_BANDS,
  BELI_BOARD,
  BELI_COMMUNITY,
  BELI_MEMBERS,
  BELI_MOVIES,
  beliTenths,
  CAM_LIST,
  LANTERN,
} from "../src/lib/how-beli-example.ts"
import {
  EXAMPLE_MEMBERS,
  NIGHT_BUS,
  ROOFTOP,
  ROOFTOP_CAM_EDIT,
  ROOFTOP_EDITED_RESULT,
  ROOFTOP_RESULT,
  scoreOf,
  type ExampleMovie,
} from "../src/lib/how-example.ts"
import { computeLeague, type RatingInput } from "../src/lib/ranking.ts"

function ratingsOf(movie: ExampleMovie, editCam?: { enjoy: number; film: number }): Record<string, RatingInput> {
  return Object.fromEntries(
    movie.ratings.map((row) => {
      const score = editCam && row.name === "Cam" ? editCam : row
      return [row.name, { experience: score.enjoy, quality: score.film }]
    }),
  )
}

function exampleWeeks(editCam?: { enjoy: number; film: number }) {
  return [
    {
      week_id: "1",
      suggester: NIGHT_BUS.suggester,
      movie: NIGHT_BUS.movie,
      ratings: ratingsOf(NIGHT_BUS),
    },
    {
      week_id: "2",
      suggester: ROOFTOP.suggester,
      movie: ROOFTOP.movie,
      ratings: ratingsOf(ROOFTOP, editCam),
    },
  ]
}

test("the how-page example matches the ranking engine", () => {
  const league = computeLeague({ members: [...EXAMPLE_MEMBERS], weeks: exampleWeeks() })
  assert.equal(league.history[0].movie, "Night Bus")
  assert.equal(league.history[0].matches.length, 0)
  assert.equal(Object.keys(league.history[0].deltas).length, 0)

  const match = league.history[1]
  assert.equal(match.movie, "Rooftop")
  assert.equal(match.matches.length, 1)
  assert.equal(match.matches[0].opponent, "Alex")
  assert.deepEqual(
    match.matches[0].judges.map((judge) => judge.judge).sort(),
    ["Cam", "Dee"],
  )
  assert.equal(formatDelta(match.deltas.Bea ?? 0), ROOFTOP_RESULT.beaDelta)
  assert.equal(formatElo(match.elo_after.Bea), ROOFTOP_RESULT.beaAfter)
  assert.equal(formatElo(match.elo_after.Alex), ROOFTOP_RESULT.alexAfter)
  assert.equal(formatElo(match.elo_after.Cam), ROOFTOP_RESULT.camAfter)
  assert.equal(formatElo(match.elo_after.Dee), ROOFTOP_RESULT.deeAfter)
  assert.equal(match.deltas.Cam, undefined)
  assert.equal(match.deltas.Dee, undefined)
  assert.ok(Math.abs(league.total_elo - 1500 * EXAMPLE_MEMBERS.length) < 1e-6)

  const cam = scoreOf(ROOFTOP, "Cam")
  const edited = computeLeague({
    members: [...EXAMPLE_MEMBERS],
    weeks: exampleWeeks(ROOFTOP_CAM_EDIT),
  })
  assert.notEqual(ROOFTOP_CAM_EDIT.enjoy, cam.enjoy)
  const editedMatch = edited.history[1]
  assert.equal(formatDelta(editedMatch.deltas.Bea ?? 0), ROOFTOP_EDITED_RESULT.beaDelta)
  assert.equal(formatElo(editedMatch.elo_after.Bea), ROOFTOP_EDITED_RESULT.beaAfter)
  assert.equal(formatElo(editedMatch.elo_after.Alex), ROOFTOP_EDITED_RESULT.alexAfter)
  assert.equal(edited.history.map((event) => event.movie).join("|"), "Night Bus|Rooftop")
})

test("two members never produce a neutral judge", () => {
  const league = computeLeague({
    members: ["Alex", "Bea"],
    weeks: [
      {
        week_id: "1",
        suggester: "Alex",
        movie: "Night Bus",
        ratings: { Bea: { experience: 8, quality: 6 } },
      },
      {
        week_id: "2",
        suggester: "Bea",
        movie: "Rooftop",
        ratings: { Alex: { experience: 8, quality: 8 } },
      },
    ],
  })
  assert.equal(league.history[1].matches.length, 0)
  assert.equal(league.history[1].skipped.Alex, "no common judges")
  assert.equal(Object.keys(league.history[1].deltas).length, 0)
  assert.ok(Math.abs(league.total_elo - 3000) < 1e-6)
})

test("the how page walks a made-up club with the live elo numbers", async () => {
  const { default: HowPage } = await import("../src/app/how/page.tsx")
  const { HOW_STORY } = await import("../src/lib/how-story.ts")
  const { utrEloParams } = await import("../src/lib/utr-elo.ts")
  const html = renderToStaticMarkup(createElement(HowPage))
  const params = utrEloParams(4)
  const rate = (score: number) => ({ experience: score, quality: score })
  const league = computeLeague({
    members: ["Ana", "Ben", "Cam", "Dee"],
    params,
    weeks: [
      {
        week_id: "1",
        suggester: "Ana",
        movie: "Paper Moon",
        ratings: { Ben: rate(8.5), Cam: rate(5.5), Dee: rate(6.9) },
      },
      {
        week_id: "2",
        suggester: "Ben",
        movie: "The Long Table",
        ratings: { Cam: rate(8.5), Dee: rate(4) },
      },
    ],
  })
  const night = league.history[1]
  assert.equal(HOW_STORY.afterLongTable.Ben, formatElo(night.elo_after.Ben))
  assert.equal(HOW_STORY.afterLongTable.Ana, formatElo(night.elo_after.Ana))
  assert.equal(HOW_STORY.newMovie.Ben, formatDelta(night.deltas.Ben ?? 0))
  assert.equal(HOW_STORY.newMovie.Ana, formatDelta(night.deltas.Ana ?? 0))
  assert.equal(params.d, 1.25)
  assert.equal(params.k, 160 / 3)

  assert.match(html, /not in your club/)
  assert.match(html, /Paper Moon/)
  assert.match(html, /The Long Table/)
  assert.match(html, /One movie at a time/)
  const groups = html.slice(html.indexOf('id="groups"'), html.indexOf('id="list"'))
  const disliked = groups.search(/Didn&#x27;t like it|Didn't like it/)
  const justOk = groups.indexOf("Just ok")
  const loved = groups.indexOf("Loved it")
  assert.ok(disliked >= 0 && disliked < justOk && justOk < loved)
  assert.ok(html.includes(HOW_STORY.alone.loved))
  assert.ok(html.includes(HOW_STORY.alone.justOk))
  assert.ok(html.includes(HOW_STORY.alone.disliked))
  assert.match(html, /7\.0–10/)
  assert.match(html, /4\.0–6\.9/)
  assert.match(html, /0–3\.9/)
  assert.match(html, /didn&#x27;t watch|didn't watch/)
  assert.ok(html.includes(HOW_STORY.startElo))
  assert.ok(html.includes(HOW_STORY.afterLongTable.Ben))
  assert.ok(html.includes(HOW_STORY.afterLongTable.Ana))
  assert.ok(html.includes(HOW_STORY.reSortedLater.Ben))
  assert.match(html, /new movie/)
  assert.match(html, /re-sorted/)
  assert.match(html, /Silver II/)
  assert.match(html, /left out/)
  assert.match(html, /group score/)
  assert.match(html, /See Rankings/)
  assert.match(html, /Challenger/)
  assert.match(html, /Grandmaster/)
  assert.match(html, /Riot Games/)
  assert.doesNotMatch(html, /Not really/)
  assert.doesNotMatch(html, /Kinda/)
  assert.doesNotMatch(html, /\bA lot\b/)
  assert.doesNotMatch(html, /too tough/i)
  assert.doesNotMatch(html, /voter/)
  assert.doesNotMatch(html, /See the board/)
  assert.equal(html.includes("redirect"), false)
})

function emptyLists(): BeliState["lists"][string] {
  return { liked: [], fine: [], disliked: [] }
}

function beliState(
  members: readonly string[],
  movies: readonly { title: string; submittedBy: string }[],
): BeliState {
  return {
    members: [...members],
    movies: movies.map((movie) => ({ title: movie.title, submitted_by: movie.submittedBy })),
    lists: Object.fromEntries(members.map((member) => [member, emptyLists()])),
  }
}

function withLists(state: BeliState, member: string, lists: BeliState["lists"][string]): BeliState {
  return { ...state, lists: { ...state.lists, [member]: lists } }
}

function shown(value: number | null | undefined): string | null {
  return value == null ? null : beliTenths(value)
}

function place(
  state: BeliState,
  member: string,
  title: string,
  bucket: keyof typeof BELI_BANDS,
  answers: Array<"new" | "old" | "too_tough" | "back"> = [],
): BeliState {
  let step = beliStart(state, member, title, bucket, false)
  for (const answer of answers) {
    assert.equal(step.done, false)
    if (step.done) throw new Error("the search finished before the answer")
    step = beliStep(state, step.insertion, answer)
  }
  assert.equal(step.done, true)
  if (!step.done) throw new Error("the search still has a question")
  return withLists(state, member, step.lists)
}

test("the how-page Beli example matches movie_beli", () => {
  let state = beliState(BELI_MEMBERS, BELI_MOVIES)

  assert.throws(
    () => beliStart(state, "Alex", NIGHT_BUS.movie, "liked", false),
    (error: unknown) => {
      assert.ok(error instanceof BeliBridgeError)
      assert.equal(error.type, "OwnSubmissionError")
      return true
    },
  )

  const nightBusAlone = beliStart(state, "Bea", NIGHT_BUS.movie, "liked", false)
  assert.equal(nightBusAlone.done, true)
  if (!nightBusAlone.done) throw new Error("an empty bucket should ask nothing")
  state = withLists(state, "Bea", nightBusAlone.lists)
  assert.equal(beliTenths(beliView(state, "Bea").my_list[0].score), beliTenths(BELI_BANDS.liked.alone))

  const asking = beliStart(state, "Bea", LANTERN, "liked", false)
  assert.equal(asking.done, false)
  if (asking.done) throw new Error("Lantern should be compared with Night Bus")
  assert.equal(asking.pivot, NIGHT_BUS.movie)
  assert.equal(asking.questions_left, 1)

  const preferred = beliStep(state, asking.insertion, "new")
  assert.equal(preferred.done, true)
  if (!preferred.done) throw new Error("one answer should finish a bucket of one")
  const ranked = withLists(state, "Bea", preferred.lists)
  assert.deepEqual(
    beliView(ranked, "Bea").my_list.map((row) => [row.movie, beliTenths(row.score)]),
    BEA_PREFER_NEW.map((row) => [row.movie, beliTenths(row.score)]),
  )

  const tough = beliStep(state, asking.insertion, "too_tough")
  assert.equal(tough.done, true)
  if (!tough.done) throw new Error("too tough should place the movie and stop")
  assert.deepEqual(
    beliView(withLists(state, "Bea", tough.lists), "Bea").my_list.map((row) => [row.movie, beliTenths(row.score)]),
    BEA_TOO_TOUGH.map((row) => [row.movie, beliTenths(row.score)]),
  )

  state = ranked
  state = place(state, "Cam", NIGHT_BUS.movie, "liked")
  state = place(state, "Cam", ROOFTOP.movie, "fine")
  assert.deepEqual(
    beliView(state, "Cam").my_list.map((row) => [row.movie, beliTenths(row.score)]),
    CAM_LIST.map((row) => [row.movie, beliTenths(row.score)]),
  )

  const view = beliView(state, "Bea")
  const community = Object.fromEntries(view.movies.map((movie) => [movie.title, movie.community_score]))
  assert.equal(shown(community[NIGHT_BUS.movie]), beliTenths(BELI_COMMUNITY.nightBus))
  assert.equal(shown(community[LANTERN]), beliTenths(BELI_COMMUNITY.lantern))
  assert.equal(shown(community[ROOFTOP.movie]), beliTenths(BELI_COMMUNITY.rooftop))
  for (const movie of view.movies) {
    assert.equal(
      movie.scores.some((score) => score.member === movie.submitted_by),
      false,
    )
  }
  assert.deepEqual(
    view.leaderboard.map((row) => [row.member, shown(row.value)]),
    BELI_BOARD.map((row) => [row.member, beliTenths(row.score)]),
  )

  const rerank = beliStart(state, "Bea", NIGHT_BUS.movie, "liked", true)
  assert.equal(rerank.done, false)
  if (rerank.done) throw new Error("re-ranking Night Bus still has Lantern to compare")
  assert.equal(rerank.pivot, LANTERN)
  assert.equal(rerank.insertion.candidates.includes(NIGHT_BUS.movie), false)
  assert.deepEqual(
    beliView(state, "Bea").my_list.map((row) => row.movie),
    BEA_PREFER_NEW.map((row) => row.movie),
  )

  const removed = beliRemove(state, "Bea", LANTERN)
  const after = withLists(state, "Bea", removed.lists)
  const afterView = beliView(after, "Alex")
  const afterCommunity = Object.fromEntries(afterView.movies.map((movie) => [movie.title, movie.community_score]))
  assert.equal(beliTenths(beliView(after, "Bea").my_list[0].score), beliTenths(AFTER_REMOVAL.beaNightBus))
  assert.equal(shown(afterCommunity[NIGHT_BUS.movie]), beliTenths(AFTER_REMOVAL.communityNightBus))
  assert.equal(afterCommunity[LANTERN], null)
  const alex = afterView.leaderboard.find((row) => row.member === "Alex")
  const bea = afterView.leaderboard.find((row) => row.member === "Bea")
  const cam = afterView.leaderboard.find((row) => row.member === "Cam")
  assert.equal(shown(alex?.value), beliTenths(AFTER_REMOVAL.alex))
  assert.equal(shown(bea?.value), beliTenths(AFTER_REMOVAL.bea))
  assert.equal(cam?.value, null)

  const withHarbor = beliState([...BELI_MEMBERS, "Dee"], [...BELI_MOVIES, { title: "Harbor", submittedBy: "Dee" }])
  withHarbor.lists.Bea = state.lists.Bea
  withHarbor.lists.Cam = state.lists.Cam
  let back = beliStart(withHarbor, "Bea", "Harbor", "liked", false)
  assert.equal(back.done, false)
  if (back.done) throw new Error("Harbor should open a question")
  assert.equal(back.pivot, NIGHT_BUS.movie)
  back = beliStep(withHarbor, back.insertion, "new")
  assert.equal(back.done, false)
  if (back.done) throw new Error("preferring Harbor should leave Lantern to compare")
  assert.equal(back.pivot, LANTERN)
  back = beliStep(withHarbor, back.insertion, "back")
  assert.equal(back.done, false)
  if (back.done) throw new Error("Back should restore the previous question")
  assert.equal(back.pivot, NIGHT_BUS.movie)
})

test("Beli score bands match a bucket of one and a bucket of two", () => {
  for (const bucket of ["liked", "fine", "disliked"] as const) {
    const band = BELI_BANDS[bucket]
    let state = beliState(["Ada", "Bea"], [
      { title: "One", submittedBy: "Ada" },
      { title: "Two", submittedBy: "Ada" },
    ])
    state = place(state, "Bea", "One", bucket)
    assert.equal(beliTenths(beliView(state, "Bea").my_list[0].score), beliTenths(band.alone))
    state = place(state, "Bea", "Two", bucket, ["old"])
    assert.deepEqual(
      beliView(state, "Bea").my_list.map((row) => beliTenths(row.score)),
      [beliTenths(band.top), beliTenths(band.bottom)],
    )
  }
})

test("rate and the board link to how, and the nav no longer offers the old modes", () => {
  const nav = fs.readFileSync(new URL("../src/components/main-nav.tsx", import.meta.url), "utf8")
  assert.match(nav, /href:\s*"\/how"/)
  assert.match(nav, /label:\s*"How"/)
  assert.match(nav, /href:\s*"\/utr"/)
  assert.match(nav, /href:\s*"\/movies"/)
  assert.match(nav, /label:\s*"Movies"/)
  assert.match(nav, /href:\s*"\/rankings"/)
  assert.match(nav, /label:\s*"Rankings"/)
  assert.doesNotMatch(nav, /href:\s*"\/beli"/)
  assert.doesNotMatch(nav, /label:\s*"Board"/)
  const rate = fs.readFileSync(new URL("../src/app/utr/page.tsx", import.meta.url), "utf8")
  const open = fs.readFileSync(new URL("../src/app/utr/open-movie.tsx", import.meta.url), "utf8")
  const board = fs.readFileSync(new URL("../src/app/rankings/page.tsx", import.meta.url), "utf8")
  const oldBoard = fs.readFileSync(new URL("../src/app/leaderboard/page.tsx", import.meta.url), "utf8")
  const alias = fs.readFileSync(new URL("../src/app/board/page.tsx", import.meta.url), "utf8")
  assert.match(oldBoard, /redirect\("\/rankings"\)/)
  assert.match(alias, /redirect\("\/rankings"\)/)
  assert.match(open, /name="history"/)
  assert.match(rate, /href="\/how"/)
  assert.match(board, /href="\/how"/)
  assert.match(board, /new movie/)
  assert.match(board, /re-sorted/)
  assert.doesNotMatch(board, /older ratings/)
  assert.doesNotMatch(board, /Starting score/)
  assert.doesNotMatch(rate, /sits above/)
  assert.doesNotMatch(rate, /board updates when/)
  assert.doesNotMatch(open, /Alone, this group/)
  assert.doesNotMatch(open, /left out when the board/)
  assert.match(open, /Pick the one you enjoyed more/)
  assert.match(open, /Waiting on/)
  assert.match(board, /RankEmblem/)
  assert.match(board, /rated pick/)
})
