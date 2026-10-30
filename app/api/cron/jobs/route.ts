import { NextRequest, NextResponse } from 'next/server'
import { safeCompare } from '@/lib/auth/session'
import { cronReport } from '@/lib/cron/report'

// GET /api/cron/jobs - every scheduled job on this site and how it last went, for
// whoever holds CRON_SECRET: the server's cactus-host, which shows it on the Oasis
// Server screen. Read only, and the same bearer check as the dispatcher, so it gives
// nothing to anyone the dispatcher would not already obey.

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  if (!safeCompare(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await cronReport())
}
