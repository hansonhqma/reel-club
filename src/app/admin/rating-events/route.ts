import { getDb } from "@/lib/db"
import { ratingEventsJsonl } from "@/lib/rating-events"
import { getCurrentUser } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Admin download of the append-only log. Not linked from the UI.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response("You need to log in again.", { status: 401 })
  if (!user.isAdmin) return new Response("Only an admin can export the rating log.", { status: 403 })
  const body = ratingEventsJsonl(getDb())
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": 'attachment; filename="rating-events.jsonl"',
    },
  })
}
