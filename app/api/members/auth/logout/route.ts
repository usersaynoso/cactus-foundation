import { NextRequest, NextResponse } from 'next/server'
import { getMemberSessionTokenFromCookie, deleteMemberSession, clearMemberSessionCookie } from '@/lib/members/session'

export async function POST(request: NextRequest) {
  const token = await getMemberSessionTokenFromCookie()
  if (token) {
    await deleteMemberSession(token).catch(() => {})
  }
  await clearMemberSessionCookie()
  return NextResponse.redirect(new URL('/logged-out', request.url))
}
