import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { cancelMemberDeletion } from '@/lib/members/deletion'

export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  await cancelMemberDeletion(member.id)
  return NextResponse.json({ ok: true })
}
