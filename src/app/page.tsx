import Link from "next/link"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/session"
import { cn } from "cn"

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) redirect("/utr")
  return <Landing />
}

function Landing() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-4">
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Movie club</p>
        <h1 className="font-heading text-5xl leading-[1.05] tracking-tight sm:text-6xl">Log in to the club.</h1>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link href="/login" className={cn(buttonVariants(), "h-11 px-4 text-base")}>
            Log in
          </Link>
          <Link href="/join" className={cn(buttonVariants({ variant: "outline" }), "h-11 bg-card px-4 text-base")}>
            Join with an invite
          </Link>
          <Link href="/how" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            How the ranking works
          </Link>
        </div>
      </section>
    </div>
  )
}
