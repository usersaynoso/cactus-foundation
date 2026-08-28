import { NextRequest, NextResponse } from 'next/server'
import { purgeEmailLog } from '@/lib/email/log'
import { safeCompare } from '@/lib/auth/session'

// Nightly sweep of the outbound email ledger. The table is small by design, but
// "small" only stays true if something takes the old rows out - a busy shop
// sends thousands of order emails a month and none of them are interesting a
// year later.
//
// Same shape as the members purge: Vercel attaches Authorization: Bearer
// $CRON_SECRET to its own cron requests when CRON_SECRET is set.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization')
  if (!safeCompare(auth ?? '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const purged = await purgeEmailLog()
  return NextResponse.json({ ok: true, purged })
}
