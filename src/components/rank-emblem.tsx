import type { UtrRank } from "@/lib/utr-ranks"
import { cn } from "cn"

const TIERS = new Set([
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
])

export const STARTING_RANK: UtrRank = { tier: "Silver", division: "II", label: "Silver II" }

export function RankEmblem({
  rank,
  size = "md",
  showLabel = true,
  className,
}: {
  rank: UtrRank
  size?: "sm" | "md"
  showLabel?: boolean
  className?: string
}) {
  const tier = rank.tier.toLowerCase()
  const src = TIERS.has(tier) ? `/ranks/emblem-${tier}.png` : "/ranks/emblem-silver.png"
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <img
        src={src}
        alt={showLabel ? "" : rank.label}
        className={size === "sm" ? "h-8 w-8 shrink-0 object-contain" : "h-14 w-14 shrink-0 object-contain"}
      />
      {showLabel ? (
        <span className={size === "sm" ? "text-xs leading-tight" : "text-sm font-medium leading-tight"}>{rank.label}</span>
      ) : null}
    </span>
  )
}
