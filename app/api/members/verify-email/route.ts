// Consumes a member email-verification token. See MEMBERS_SPEC.md "Registration".
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { consumeVerificationToken } from '@/lib/members/tokens'
import { deriveActivatedStatus, loginRejectionForStatus } from '@/lib/members/registration'
import { notifyAdminMemberPendingApproval } from '@/lib/members/admin-notify'
import { createMemberSession, setMemberSessionCookie } from '@/lib/members/session'
import { recordMemberActivity } from '@/lib/members/activity'
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

  // Clicking the link out of their inbox proves the address is theirs, which is
  // exactly the proof a sign-in link carries - so it is worth the same thing.
  // Verifying and then being handed to the sign-in page asked a brand-new
  // member to prove the same fact twice in a row, which is where most of them
  // stopped. A verification token only ever exists for a member sitting on
  // PENDING_VERIFICATION (the register and resend routes are the only issuers,
  // and resend refuses any other status), so this can never sign in past a
  // second factor or a suspension - and loginRejectionForStatus still has the
  // final say, which keeps approval-required sites waiting for their admin.
  let signedIn = false
  if (!loginRejectionForStatus(member.status)) {
    const sessionToken = await createMemberSession(result.memberId, {
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })
    await setMemberSessionCookie(sessionToken)
    await recordMemberActivity(result.memberId, 'login', { metadata: { method: 'EMAIL_VERIFICATION' } })
    signedIn = true
  }

  return NextResponse.json({ status: member.status, signedIn })
}
