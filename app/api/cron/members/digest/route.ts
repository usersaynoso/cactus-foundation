import { NextRequest, NextResponse } from 'next/server'
import { runDigest } from '@/lib/members/digest'
import { safeCompare } from '@/lib/auth/session'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization')
  if (!safeCompare(auth ?? '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mode = request.nextUrl.searchParams.get('mode') === 'weekly' ? 'WEEKLY' : 'DAILY'
  const sent = await runDigest(mode)

  return NextResponse.json({ ok: true, mode, sent })
}
