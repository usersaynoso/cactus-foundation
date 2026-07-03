import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const passkey = await prisma.memberPasskey.findUnique({ where: { id } })
  if (!passkey || passkey.memberId !== member.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const remaining = await prisma.memberPasskey.count({ where: { memberId: member.id, NOT: { id } } })
  if (remaining === 0) {
    // Unlike admin (where password is the only fallback), members always have
    // magic link as a fallback so long as it's an allowed method - only block
    // the deletion when NEITHER a magic-link path NOR a working password
    // exists, since that would leave zero ways to sign back in.
    const config = await getMembersConfig()
    const hasMagicLinkFallback = config.allowedAuthMethods.includes('MAGIC_LINK')
    if (!hasMagicLinkFallback) {
      const password = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
      if (!password) {
        return NextResponse.json(
          { error: 'Cannot remove your only sign-in method - you would be locked out.' },
          { status: 400 }
        )
      }
    }
  }

  await prisma.memberPasskey.delete({ where: { id } })
  await notifyMemberSecurityAlert(member, 'A passkey was removed from your account.')
  return NextResponse.json({ ok: true })
}
