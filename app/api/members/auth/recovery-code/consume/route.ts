// Alternate second factor: one-time recovery code, for a member who has lost
// access to their email/authenticator app. Same rate-limit bucket as 2FA.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { consumeMemberRecoveryCode } from '@/lib/members/recovery-codes'
import { loginRejectionForStatus } from '@/lib/members/registration'
import { createMemberSession, setMemberSessionCookie } from '@/lib/members/session'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { recordMemberActivity } from '@/lib/members/activity'

const Body = z.object({
  memberId: z.string(),
  code: z.string(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { memberId, code } = parsed.data

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_2fa', [`ip:${ip}`, `account:${memberId}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 })
  }

  const consumed = await consumeMemberRecoveryCode(memberId, code)
  if (!consumed) {
    return NextResponse.json({ error: 'Invalid or already-used recovery code' }, { status: 401 })
  }

  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) {
    return NextResponse.json({ error: 'Invalid or already-used recovery code' }, { status: 401 })
  }

  const rejection = loginRejectionForStatus(member.status)
  if (rejection) {
    return NextResponse.json(
      { error: rejection.error, redirectToVerify: rejection.redirectToVerify },
      { status: 403 }
    )
  }

  const token = await createMemberSession(member.id, {
    ipAddress: ip,
    userAgent: request.headers.get('user-agent') ?? undefined,
  })
  await setMemberSessionCookie(token)
  await recordMemberActivity(member.id, 'login', { metadata: { method: 'RECOVERY_CODE' } })

  return NextResponse.json({ verified: true, memberId: member.id })
}
