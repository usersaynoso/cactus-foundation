import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { runIndex, purgeOldQueries } from '@/modules/search/lib/indexer'
import { syncIndexAlert } from '@/modules/search/lib/alerts'
import { getSearchSettings } from '@/modules/search/lib/settings'

// Nightly incremental reindex + query-log purge.
// Vercel appends `Authorization: Bearer $CRON_SECRET` to its own cron requests
// automatically when CRON_SECRET is set - no separate secret scheme needed.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  // Caught and reported rather than thrown. An uncaught error here is masked by the
  // framework into a bare "Internal Server Error", so core's cron dispatcher records
  // "HTTP 500" and the owner is told a job failed with no hint as to why - which is
  // exactly how a broken query in the purge below went unnoticed night after night.
  try {
    const result = await runIndex({ full: false })
    const settings = await getSearchSettings()
    const purged = await purgeOldQueries(settings.logRetentionDays)
    await syncIndexAlert()

    return NextResponse.json({ ok: true, ...result, purgedQueries: purged })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'the reindex run failed', 500)
  }
}
