import { NextRequest, NextResponse } from 'next/server'
import { safeCompare } from '@/lib/auth/session'
import { sweepRetiredMediaBlobs } from '@/lib/media/retired-blobs'

// Hourly sweep of superseded media blobs whose cache windows have passed - see
// lib/media/retired-blobs.ts for why they are not deleted on the spot.
//
// Same shape as the other core crons: Vercel, and the dispatcher after it, send
// Authorization: Bearer $CRON_SECRET.
export const maxDuration = 60

// Stops taking new work with this much of the function's time left, so the reply
// always gets out. Whatever is still due goes first on the next tick.
const RESERVE_MS = 10_000

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization')
  if (!safeCompare(auth ?? '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const swept = await sweepRetiredMediaBlobs({ deadline: Date.now() + maxDuration * 1000 - RESERVE_MS })
  return NextResponse.json({ ok: true, ...swept })
}
