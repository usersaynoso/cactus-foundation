import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from '@/lib/members/api-auth'
import { listMemberActivity } from '@/lib/members/activity'

export async function GET(request: NextRequest) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const events = await listMemberActivity(member.id)
  return NextResponse.json({ events })
}
