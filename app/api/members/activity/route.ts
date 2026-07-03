import { NextResponse } from 'next/server'
import { getMemberFromCookie } from '@/lib/members/session'
import { listMemberActivity } from '@/lib/members/activity'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const events = await listMemberActivity(member.id)
  return NextResponse.json({ events })
}
