import Link from "next/link"
import { redirect } from "next/navigation"
import { JoinForm } from "@/components/join-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getInviteCode } from "@/lib/auth"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Join" }

export default async function JoinPage() {
  if (await getCurrentUser()) redirect("/")
  const invite = getInviteCode()
  const showDevInvite = process.env.NODE_ENV !== "production" && invite === "come-watch"
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-3xl">Join the club</CardTitle>
          <CardDescription>
            Your name on Rankings is what the ranking uses. Pick it carefully; it stays put. If nobody
            has joined yet, you become the admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <JoinForm inviteDisabled={!invite} />
          {showDevInvite ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm">
              Development invite code: <span className="font-medium">come-watch</span>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Already a member? <Link href="/login" className="text-primary underline-offset-4 hover:underline">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
