export const PALETTE = [
  "#7a2e32",
  "#1f6b5a",
  "#1f4e79",
  "#a15c07",
  "#5c4d7a",
  "#8a3d5b",
  "#3f5c2a",
  "#0f6e7a",
]

export function memberColor(name: string, members: string[]): string {
  const sorted = [...members].sort((a, b) => a.localeCompare(b))
  const index = Math.max(0, sorted.indexOf(name))
  return PALETTE[index % PALETTE.length]
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso))
}

export function formatElo(value: number): string {
  return value.toFixed(1)
}

export function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) return "0.0"
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1)
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

// Leaderboard row: how many of the movies this member added have a community score.
export function addedMoviesScoreLine(ranked: number, submitted: number): string {
  if (submitted === 1 && ranked === 0) return "0 of 1 added movie, no score yet"
  const movies = submitted === 1 ? "movie" : "movies"
  const verb = ranked === 1 ? "has" : "have"
  return `${ranked} of ${submitted} added ${movies} ${verb} a score`
}
