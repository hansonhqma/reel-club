import Link from "next/link"
import { LoginForm } from "@/components/login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { findUserByUsername } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"

export const metadata = { title: "Log in" }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/")
  const showDemo = process.env.NODE_ENV !== "production" && findUserByUsername("mira") !== null
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-3xl">Welcome back</CardTitle>
          <CardDescription>For members. Same username as always.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          {showDemo ? (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm leading-relaxed">
              Demo club: log in as mira, jules, theo, noor, or sam. Password{" "}
              <span className="font-medium">reel-night</span>. Mira is the admin.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            New here? <Link href="/join" className="text-primary underline-offset-4 hover:underline">Join with an invite</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
