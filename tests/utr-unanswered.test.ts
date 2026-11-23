import assert from "node:assert/strict"
import fs from "node:fs"
import React, { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { after, test } from "node:test"
import { createMember, findUserByUsername } from "../src/lib/auth"
import { closeDb } from "../src/lib/db"
import { STARTING_RANK } from "../src/components/rank-emblem.tsx"
import { ClosePreviewList } from "../src/components/close-ratings-dialog.tsx"
import { utrUnanswered } from "../src/lib/utr-roster.ts"
import { skipUtrMovie, startUtrRating, suggestUtrMovie } from "../src/lib/utr.ts"
import { prepareTestDb } from "./helpers.ts"

globalThis.React = React

const dir = prepareTestDb()

after(() => {
  closeDb()
  fs.rmSync(dir, { recursive: true, force: true })
})

function idOf(username: string): number {
  const user = findUserByUsername(username)
  if (!user) throw new Error(`missing ${username}`)
  return user.id
}

test("the close dialog lists only people with no answer and no scores", () => {
  createMember({ username: "ada", name: "Ada", password: "correct-horse", isAdmin: true })
  createMember({ username: "bea", name: "Bea", password: "correct-horse", isAdmin: false })
  createMember({ username: "cyo", name: "Cy", password: "correct-horse", isAdmin: false })
  const ada = idOf("ada")
  const bea = idOf("bea")
  const cy = idOf("cyo")
  const heat = suggestUtrMovie(ada, "Heat")
  assert.equal(startUtrRating(ada, heat.id, "a_lot").done, true)
  skipUtrMovie(bea, heat.id)

  const waiting = utrUnanswered(heat.id, ada)
  assert.deepEqual(
    waiting.map((person) => person.name),
    ["Cy"],
  )
  assert.equal("bucket" in waiting[0], false)
  assert.equal("score" in waiting[0], false)

  const pending = renderToStaticMarkup(
    createElement(ClosePreviewList, {
      waiting: waiting.map((person) => ({ ...person, rank: STARTING_RANK })),
    }),
  )
  assert.match(pending, /Still waiting on/)
  assert.match(pending, /Cy/)
  assert.match(pending, /didn&#x27;t watch|didn't watch/)
  assert.doesNotMatch(pending, /Loved it|8\.5|a_lot/)

  const done = renderToStaticMarkup(createElement(ClosePreviewList, { waiting: [] }))
  assert.match(done, /Everyone&#x27;s in|Everyone's in/)
  assert.doesNotMatch(done, /Still waiting on/)

  assert.equal(utrUnanswered(heat.id, cy).some((person) => person.userId === cy), true)
  assert.equal(utrUnanswered(heat.id, ada).some((person) => person.userId === bea), false)
})
