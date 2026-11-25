import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberAuthFromRequest, getMemberFromRequest } from '@/lib/members/api-auth'
import { requireStepUpGrant, spendStepUpGrant } from '@/lib/members/api-step-up'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

export async function GET(request: NextRequest) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const twoFactor = await prisma.memberTwoFactor.findFirst({
    where: { memberId: member.id, verified: true },
    select: { method: true },
  })

  return NextResponse.json({ enabled: !!twoFactor, method: twoFactor?.method ?? null })
}

// 2FA is mandatory whenever a password is set, so removal is refused while a
// password still exists - remove the password first. From an app (a module
// token) it needs a step-up grant (lib/members/api-step-up.ts).
export async function DELETE(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  const needsStepUp = await requireStepUpGrant(auth, request)
  if (needsStepUp) return needsStepUp

  const password = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
  if (password) {
    return NextResponse.json(
      { error: 'Remove your password first - two-factor authentication is required while a password is set.' },
      { status: 400 }
    )
  }

  const spent = await spendStepUpGrant(auth, request)
  if (spent) return spent

  await prisma.memberTwoFactor.deleteMany({ where: { memberId: member.id } })
  await notifyMemberSecurityAlert(member, 'Two-factor authentication was removed from your account.')
  return NextResponse.json({ ok: true })
}
