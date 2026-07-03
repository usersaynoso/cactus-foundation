import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { requestMemberDeletion } from '@/lib/members/deletion'

export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const scheduledAt = await requestMemberDeletion(member.id)
  return NextResponse.json({ scheduledAt })
}
