// Requests a magic sign-in link. Enumeration-safe: always {ok:true}
// regardless of whether the email exists or magic-link is enabled — mirrors
// app/api/auth/recovery/request/route.ts. Status gating happens at consume
// time (loginRejectionForStatus), not here, so this sends the link whenever
// the member exists, whatever their status.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig } from '@/lib/members/config'
import { sendMagicLink } from '@/lib/members/magic-link'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({ email: z.string().email() })

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_magic_link', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ ok: true })
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: true })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true })
  }

  const config = await getMembersConfig()
  if (!config.enabled || !config.allowedAuthMethods.includes('MAGIC_LINK')) {
    return NextResponse.json({ ok: true })
  }

  const member = await prisma.member.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true },
  })

  if (member) {
    const siteConfig = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { siteName: true },
    })
    await sendMagicLink(member.id, member.email, siteConfig?.siteName ?? 'Cactus')
  }

  return NextResponse.json({ ok: true })
}
