import { getDb } from "../src/lib/db"
import { ratingEventsJsonl } from "../src/lib/rating-events"

// Local export for someone who already has the database file.
// The HTTP route /admin/rating-events is the admin-only path.
process.stdout.write(ratingEventsJsonl(getDb()))
