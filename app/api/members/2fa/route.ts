import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const twoFactor = await prisma.memberTwoFactor.findFirst({
    where: { memberId: member.id, verified: true },
    select: { method: true },
  })

  return NextResponse.json({ enabled: !!twoFactor, method: twoFactor?.method ?? null })
}

// 2FA is mandatory whenever a password is set, so removal is refused while a
// password still exists - remove the password first.
export async function DELETE() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const password = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
  if (password) {
    return NextResponse.json(
      { error: 'Remove your password first - two-factor authentication is required while a password is set.' },
      { status: 400 }
    )
  }

  await prisma.memberTwoFactor.deleteMany({ where: { memberId: member.id } })
  await notifyMemberSecurityAlert(member, 'Two-factor authentication was removed from your account.')
  return NextResponse.json({ ok: true })
}
