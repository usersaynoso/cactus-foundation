import { NextResponse } from 'next/server'
import {
  getMemberFromCookie,
  listMemberSessions,
  deleteAllMemberSessions,
  getCurrentMemberSessionTokenHash,
} from '@/lib/members/session'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const currentHash = await getCurrentMemberSessionTokenHash()
  const sessions = await listMemberSessions(member.id)
  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      location: s.location,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.tokenHash === currentHash,
    })),
  })
}

// Revoke every session except the caller's own (mirrors admin's account/sessions).
export async function DELETE() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const currentHash = await getCurrentMemberSessionTokenHash()
  await deleteAllMemberSessions(member.id, currentHash ?? undefined)
  return NextResponse.json({ ok: true })
}
