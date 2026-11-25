import { NextRequest, NextResponse } from 'next/server'
import { getMemberFromRequest } from '@/lib/members/api-auth'
import { revokeMemberSessionById } from '@/lib/members/session'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  await revokeMemberSessionById(id, member.id)
  return NextResponse.json({ ok: true })
}
