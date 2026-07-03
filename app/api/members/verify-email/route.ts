// Consumes a member email-verification token. See MEMBERS_SPEC.md "Registration".
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { consumeVerificationToken } from '@/lib/members/tokens'
import { deriveActivatedStatus } from '@/lib/members/registration'
import { notifyAdminMemberPendingApproval } from '@/lib/members/admin-notify'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({ token: z.string() })

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_verify', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const result = await consumeVerificationToken(parsed.data.token)
  if (!result) {
    return NextResponse.json({ error: 'This verification link is invalid or has expired' }, { status: 400 })
  }

  const config = await getMembersConfig()
  const status = deriveActivatedStatus(config.registrationMode)

  const member = await prisma.member.update({
    where: { id: result.memberId },
    data: { emailVerified: true, emailVerifiedAt: new Date(), status },
    select: { status: true, username: true },
  })

  if (member.status === 'PENDING_APPROVAL' && config.notifyAdminOnPendingApproval) {
    await notifyAdminMemberPendingApproval(result.memberId, member.username).catch(() => {})
  }

  return NextResponse.json({ status: member.status })
}
