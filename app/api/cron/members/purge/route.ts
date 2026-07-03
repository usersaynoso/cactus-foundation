import { NextRequest, NextResponse } from 'next/server'
import { purgeScheduledDeletions } from '@/lib/members/deletion'

// Vercel appends `Authorization: Bearer $CRON_SECRET` to its own cron requests
// automatically when CRON_SECRET is set - same pattern as module crons.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const purged = await purgeScheduledDeletions()
  return NextResponse.json({ ok: true, purged })
}
