// Resends a member's email-verification link. Enumeration-safe: always
// responds {ok:true} regardless of whether the email is registered, has
// already been verified, or is being throttled. See MEMBERS_SPEC.md.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { canResendVerification } from '@/lib/members/tokens'
import { sendVerificationEmail } from '@/lib/members/registration'
import { isEmailConfigured } from '@/lib/config/env'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({ email: z.string().email() })

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_verify', [`ip:${ip}`])
  if (!rl.allowed) {
    // Still {ok:true} - rate-limiting must not leak via a different response shape.
    return NextResponse.json({ ok: true })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ ok: true })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true })
  }

  const member = await prisma.member.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, status: true },
  })

  if (member && member.status === 'PENDING_VERIFICATION' && (await canResendVerification(member.id))) {
    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true },
    })
    await sendVerificationEmail(member.id, member.email, config?.siteName ?? 'Cactus')
  }

  return NextResponse.json({ ok: true })
}
