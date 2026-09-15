import { prisma } from '@/lib/db/prisma'
import { upsertAlert, clearAlert } from '@/lib/notifications/alerts'

const DEDUPE_KEY = 'search:index-empty'

// Admin bell notification for the one state search cannot dig itself out of:
// an empty index (fresh install, nothing indexed yet). Clicking it lands on
// Settings -> Search, whose "Rebuild index now" button runs the build - the
// standalone dashboard page is not routable on every install, so the settings
// tab is the one destination that always exists. Cleared the moment the index
// holds anything. Kept to a single rolling notification by dedupeKey (same
// pattern as core-update / contact-form:messages).
export async function syncIndexAlert(): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM "srch_documents"
    `
    const empty = Number(rows[0]?.count ?? 0) === 0
    if (empty) {
      await upsertAlert({
        type: 'message',
        dedupeKey: DEDUPE_KEY,
        title: 'Search has nothing in its index yet, so searches find nothing',
        link: '/config?tab=search',
        // Settings -> Search carries the "Rebuild index now" button, so this
        // button genuinely does what it says.
        actionLabel: 'Build the index',
      })
    } else {
      await clearAlert(DEDUPE_KEY)
    }
  } catch {
    // Never let bookkeeping break search or a cron run.
  }
}
