"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"

const LINKS = [
  { href: "/movies", label: "Movies" },
  { href: "/utr", label: "Rate" },
  { href: "/leaderboard", label: "Board" },
  { href: "/beli", label: "Beli" },
  { href: "/how", label: "How" },
]

export function MainNav({
  variant,
  showAdmin,
}: {
  variant: "bar" | "bottom"
  showAdmin?: boolean
}) {
  const pathname = usePathname()
  const links = showAdmin && variant === "bar" ? [...LINKS, { href: "/admin", label: "Members" }] : LINKS

  if (variant === "bottom") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex h-14 items-center justify-center text-sm font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    )
  }

  return (
    <nav className="ml-auto hidden items-center gap-1 md:flex">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              active ? "bg-primary-foreground text-primary" : "text-primary-foreground/85 hover:bg-primary-foreground/10",
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
