import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { generateMemberRecoveryCodes, countRemainingRecoveryCodes } from '@/lib/members/recovery-codes'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const remaining = await countRemainingRecoveryCodes(member.id)
  return NextResponse.json({ remaining })
}

// Regenerating always requires 2FA to already be configured - recovery codes
// exist purely as a 2FA fallback (see MEMBERS_SPEC.md).
export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const twoFactor = await prisma.memberTwoFactor.findFirst({ where: { memberId: member.id, verified: true } })
  if (!twoFactor) {
    return NextResponse.json({ error: 'Set up two-factor authentication first' }, { status: 400 })
  }

  const codes = await generateMemberRecoveryCodes(member.id)
  return NextResponse.json({ recoveryCodes: codes })
}
