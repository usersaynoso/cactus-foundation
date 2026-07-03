import { NextResponse } from 'next/server'
import { getMemberFromCookie, revokeMemberTrustedBrowserById } from '@/lib/members/session'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  await revokeMemberTrustedBrowserById(id, member.id)
  return NextResponse.json({ ok: true })
}
