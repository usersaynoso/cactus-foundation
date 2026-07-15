import { NextRequest, NextResponse } from 'next/server'
import { expireDataExports } from '@/lib/members/export'
import { safeCompare } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })

  const auth = request.headers.get('authorization')
  if (!safeCompare(auth ?? '', `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const expired = await expireDataExports()
  return NextResponse.json({ ok: true, expired })
}
