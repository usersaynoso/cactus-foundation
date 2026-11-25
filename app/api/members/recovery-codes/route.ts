import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberAuthFromRequest, getMemberFromRequest } from '@/lib/members/api-auth'
import { requireStepUpGrant, spendStepUpGrant } from '@/lib/members/api-step-up'
import { generateMemberRecoveryCodes, countRemainingRecoveryCodes } from '@/lib/members/recovery-codes'

export async function GET(request: NextRequest) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const remaining = await countRemainingRecoveryCodes(member.id)
  return NextResponse.json({ remaining })
}

// Regenerating always requires 2FA to already be configured - recovery codes
// exist purely as a 2FA fallback (see MEMBERS_SPEC.md). From an app (a module
// token) it also needs a step-up grant: fresh codes are a way past the second
// step, and a token on its own is not proof the member is holding the phone.
export async function POST(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { member } = auth

  const needsStepUp = await requireStepUpGrant(auth, request)
  if (needsStepUp) return needsStepUp

  const twoFactor = await prisma.memberTwoFactor.findFirst({ where: { memberId: member.id, verified: true } })
  if (!twoFactor) {
    return NextResponse.json({ error: 'Set up two-factor authentication first' }, { status: 400 })
  }

  const spent = await spendStepUpGrant(auth, request)
  if (spent) return spent

  const codes = await generateMemberRecoveryCodes(member.id)
  return NextResponse.json({ recoveryCodes: codes })
}
