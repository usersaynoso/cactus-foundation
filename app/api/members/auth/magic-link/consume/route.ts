import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { consumeMagicLink } from '@/lib/members/magic-link'
import { loginRejectionForStatus } from '@/lib/members/registration'
import { createMemberSession, setMemberSessionCookie } from '@/lib/members/session'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { recordMemberActivity } from '@/lib/members/activity'

const Body = z.object({ token: z.string() })

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_magic_link', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const result = await consumeMagicLink(parsed.data.token)
  if (!result) {
    return NextResponse.json({ error: 'This sign-in link is invalid or has expired' }, { status: 400 })
  }

  const member = await prisma.member.findUnique({ where: { id: result.memberId } })
  if (!member) {
    return NextResponse.json({ error: 'This sign-in link is invalid or has expired' }, { status: 400 })
  }

  const rejection = loginRejectionForStatus(member.status)
  if (rejection) {
    // The member's own email, returned only once they've proven ownership of
    // it (by consuming a token that was mailed to it) - lets the client
    // prefill the resend-verification field without a second round trip.
    return NextResponse.json(
      { error: rejection.error, redirectToVerify: rejection.redirectToVerify, email: member.email },
      { status: 403 }
    )
  }

  const token = await createMemberSession(member.id, {
    ipAddress: ip,
    userAgent: request.headers.get('user-agent') ?? undefined,
  })
  await setMemberSessionCookie(token)
  await recordMemberActivity(member.id, 'login', { metadata: { method: 'MAGIC_LINK' } })

  return NextResponse.json({ verified: true, memberId: member.id })
}
