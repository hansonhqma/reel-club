// Labels on Elo. Cutoffs match prototype/utr/ranks.py.
// Promote as soon as Elo crosses a line. Demote only once it is 10 points
// below the line currently held. Challenger and Grandmaster are chairs.

export const DIVISION_ORDER = ["IV", "III", "II", "I"] as const

const LADDER = [
  ["Bronze", 1240, 40],
  ["Silver", 1400, 40],
  ["Gold", 1560, 40],
  ["Platinum", 1720, 20],
  ["Emerald", 1800, 30],
  ["Diamond", 1920, 40],
  ["Master", 2080, 0],
] as const

const IRON_WIDTH = 40
const IRON_FLOOR = LADDER[0][1] - 3 * IRON_WIDTH

export const CHALLENGER_MIN_PICKS = 6
export const GRANDMASTER_MIN_PICKS = 6
export const CHALLENGER_MIN_ELO = 1800
export const GRANDMASTER_MIN_ELO = 1720
export const DEMOTION_BUFFER = 10

const ABSOLUTE_ORDER = ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master"]

export type UtrRank = {
  tier: string
  division: string | null
  label: string
}

export type RankStep = {
  movieId: number
  suggesterId: number
  elo: Record<number, number>
  scores: Map<number, Map<number, number>>
}

export type RankSnapshot = {
  ranks: Record<number, UtrRank>
  ratedPicks: Record<number, number>
}

function tierSpan(tier: string): [number, number] {
  for (const [name, floor, width] of LADDER) {
    if (name === tier) return [floor, width]
  }
  throw new Error(`unknown tier ${tier}`)
}

function divisionCuts(tier: string): [string | null, number | null][] {
  if (tier === "Iron") {
    return [
      ["IV", null],
      ["III", IRON_FLOOR],
      ["II", IRON_FLOOR + IRON_WIDTH],
      ["I", IRON_FLOOR + 2 * IRON_WIDTH],
    ]
  }
  const [floor, width] = tierSpan(tier)
  if (tier === "Master") return [[null, floor]]
  return DIVISION_ORDER.map((division, index) => [division, floor + index * width])
}

export function absoluteRank(elo: number): [string, string | null] {
  if (elo < LADDER[0][1]) {
    const cuts = divisionCuts("Iron")
    for (let index = cuts.length - 1; index >= 0; index -= 1) {
      const [division, floor] = cuts[index]
      if (floor != null && elo >= floor) return ["Iron", division]
    }
    return ["Iron", "IV"]
  }
  const ladder = [...LADDER]
  for (let index = 0; index < ladder.length; index += 1) {
    const [name, floor, width] = ladder[index]
    const next = ladder[index + 1]
    if (name === "Master" || (next != null && elo < next[1]) || next == null) {
      if (name === "Master") return ["Master", null]
      const division = Math.min(3, Math.floor((elo - floor) / width))
      return [name, DIVISION_ORDER[division]]
    }
  }
  return ["Master", null]
}

export function formatRank(tier: string, division: string | null): string {
  if (division == null) return tier
  return `${tier} ${division}`
}

export function absoluteLabel(elo: number): string {
  return formatRank(...absoluteRank(elo))
}

export function toRank(label: string): UtrRank {
  if (label === "Master" || label === "Grandmaster" || label === "Challenger") {
    return { tier: label, division: null, label }
  }
  const [tier, division] = label.split(" ")
  return { tier, division, label }
}

export function assignRanks(
  elos: Record<string, number>,
  picks: Record<string, number>,
  base?: Record<string, string>,
): Record<string, string> {
  const order = Object.keys(elos).sort((a, b) => elos[b] - elos[a] || (a < b ? -1 : a > b ? 1 : 0))
  const labels: Record<string, string> = {}
  for (const name of order) labels[name] = base ? base[name] : absoluteLabel(elos[name])
  if (order.length === 0) return labels
  const leader = order[0]
  const leaderIsChallenger = elos[leader] >= CHALLENGER_MIN_ELO && (picks[leader] ?? 0) >= CHALLENGER_MIN_PICKS
  if (leaderIsChallenger) labels[leader] = "Challenger"
  if (leaderIsChallenger && order.length > 1) {
    const second = order[1]
    if (elos[second] >= GRANDMASTER_MIN_ELO && (picks[second] ?? 0) >= GRANDMASTER_MIN_PICKS) {
      labels[second] = "Grandmaster"
    }
  }
  return labels
}

export function rankFloor(label: string): number | null {
  if (label === "Master") return tierSpan("Master")[0]
  const [tier, division] = label.split(" ")
  for (const [name, floor] of divisionCuts(tier)) {
    if (name === division) return floor
  }
  throw new Error(`unknown rank ${label}`)
}

export function rankIndex(label: string): number {
  if (label === "Challenger") return 100
  if (label === "Grandmaster") return 99
  if (label === "Master") return 90
  const [tier, division] = label.split(" ")
  return ABSOLUTE_ORDER.indexOf(tier) * 4 + DIVISION_ORDER.indexOf(division as (typeof DIVISION_ORDER)[number])
}

export function nextAbsolute(held: string, elo: number): string {
  const natural = absoluteLabel(elo)
  if (rankIndex(natural) >= rankIndex(held)) return natural
  const floor = rankFloor(held)
  if (floor == null || elo >= floor - DEMOTION_BUFFER) return held
  return natural
}

function othersScored(step: RankStep, scores: Map<number, Map<number, number>>): boolean {
  for (const [userId, mine] of scores) {
    if (userId === step.suggesterId) continue
    if (mine.has(step.movieId)) return true
  }
  return false
}

// Ranks after each close, in order. The cushion remembers the absolute rank,
// and the chairs are applied on top of that. A rated pick is a movie this
// member suggested that someone else had scored by this close.
export function rankSnapshots(steps: RankStep[], names: Map<number, string>): RankSnapshot[] {
  const held = new Map<number, string>()
  const snapshots: RankSnapshot[] = []
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const picks: Record<number, number> = {}
    for (const earlier of steps.slice(0, index + 1)) {
      if (!othersScored(earlier, step.scores)) continue
      picks[earlier.suggesterId] = (picks[earlier.suggesterId] ?? 0) + 1
    }
    for (const id of Object.keys(step.elo).map(Number)) {
      if (!held.has(id)) held.set(id, absoluteLabel(1500))
      held.set(id, nextAbsolute(held.get(id) ?? absoluteLabel(1500), step.elo[id]))
    }
    const eloByName: Record<string, number> = {}
    const picksByName: Record<string, number> = {}
    const baseByName: Record<string, string> = {}
    const idByName = new Map<string, number>()
    for (const [idText, elo] of Object.entries(step.elo)) {
      const id = Number(idText)
      const name = names.get(id) ?? String(id)
      eloByName[name] = elo
      picksByName[name] = picks[id] ?? 0
      baseByName[name] = held.get(id) ?? absoluteLabel(1500)
      idByName.set(name, id)
    }
    const labels = assignRanks(eloByName, picksByName, baseByName)
    const ranks: Record<number, UtrRank> = {}
    const ratedPicks: Record<number, number> = {}
    for (const [name, label] of Object.entries(labels)) {
      const id = idByName.get(name)
      if (id == null) continue
      ranks[id] = toRank(label)
      ratedPicks[id] = picksByName[name] ?? 0
    }
    snapshots.push({ ranks, ratedPicks })
  }
  return snapshots
}
