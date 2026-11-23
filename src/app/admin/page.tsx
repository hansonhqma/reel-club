import { redirect } from "next/navigation"
import { MemberForm } from "@/components/member-form"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getInviteCode, listUsers } from "@/lib/auth"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Members" }

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; error?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.isAdmin) redirect("/")
  const query = await searchParams
  const members = listUsers()
  const invite = getInviteCode()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">Admin</p>
        <h1 className="mt-1 font-heading text-4xl tracking-tight">Members</h1>
      </div>

      {query.added ? (
        <p role="status" className="rounded-xl bg-accent px-4 py-3 text-sm">
          {query.added} can log in.
        </p>
      ) : null}
      {query.error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {query.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Who&apos;s in</CardTitle>
          <CardDescription>{invite ? `Invite code: ${invite}` : "Invite codes are off."}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-medium">{member.name}</span>
                  <span className="text-muted-foreground"> · {member.username}</span>
                </span>
                {member.isAdmin ? <Badge variant="secondary">Admin</Badge> : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Add someone</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberForm />
        </CardContent>
      </Card>
    </div>
  )
}
