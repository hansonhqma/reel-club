import Link from "next/link"
import { logoutAction } from "@/app/actions"
import { MainNav } from "@/components/main-nav"
import { RankEmblem, STARTING_RANK } from "@/components/rank-emblem"
import { Button, buttonVariants } from "@/components/ui/button"
import type { PublicUser } from "@/lib/auth"
import { utrBoard } from "@/lib/utr"
import { cn } from "cn"

export function Shell({
  user,
  children,
}: {
  user: PublicUser | null
  children: React.ReactNode
}) {
  const mine = user ? (utrBoard()?.rows.find((row) => row.name === user.name)?.rank ?? STARTING_RANK) : null
  return (
    <div className="min-h-dvh">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="font-heading text-[1.65rem] leading-none tracking-tight">
            Reel Club
          </Link>
          {user ? <MainNav variant="bar" showAdmin={user.isAdmin} /> : null}
          <div className={cn("flex items-center gap-2", user ? "ml-auto md:ml-3" : "ml-auto")}>
            {user ? (
              <>
                <span className="hidden items-center gap-2 text-sm text-primary-foreground/90 sm:inline-flex">
                  {mine ? <RankEmblem rank={mine} size="sm" className="text-primary-foreground" /> : null}
                  <span>{user.name}</span>
                </span>
                {user.isAdmin ? (
                  <Link href="/admin" className="text-sm underline-offset-4 hover:underline md:hidden">
                    Members
                  </Link>
                ) : null}
                <form action={logoutAction}>
                  <Button
                    type="submit"
                    variant="secondary"
                    className="h-9 bg-primary-foreground px-3 text-primary hover:bg-primary-foreground/90"
                  >
                    Log out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link href="/how" className="text-sm font-medium underline-offset-4 hover:underline">
                  How
                </Link>
                <Link href="/login" className={cn(buttonVariants({ variant: "secondary" }), "h-9 bg-primary-foreground px-3 text-primary")}>
                  Log in
                </Link>
                <Link href="/join" className="text-sm font-medium underline-offset-4 hover:underline">
                  Join
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex h-3 items-center gap-2 overflow-hidden bg-marquee px-2" aria-hidden>
          {Array.from({ length: 28 }).map((_, index) => (
            <span key={index} className="h-2 w-4 shrink-0 rounded-[2px] bg-foreground/75" />
          ))}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {children}
      </main>
      <footer className={cn("mx-auto w-full max-w-5xl px-4 text-xs leading-relaxed text-muted-foreground", user ? "pb-24 md:pb-8" : "pb-8")}>
        Reel Club isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or
        anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are
        trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.
      </footer>
      {user ? <MainNav variant="bottom" /> : null}
    </div>
  )
}
