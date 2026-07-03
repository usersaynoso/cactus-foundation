import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie, deleteAllMemberSessions, getCurrentMemberSessionTokenHash } from '@/lib/members/session'
import { hashPassword, verifyPassword, validateNewPassword } from '@/lib/auth/password'
import { getMembersConfig } from '@/lib/members/config'
import { notifyMemberSecurityAlert } from '@/lib/members/security-alerts'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [password, twoFactor, config] = await Promise.all([
    prisma.memberPassword.findUnique({ where: { memberId: member.id } }),
    prisma.memberTwoFactor.findFirst({ where: { memberId: member.id } }),
    getMembersConfig(),
  ])

  return NextResponse.json({
    hasPassword: !!password,
    hasTwoFactor: !!twoFactor,
    passwordsEnabled: config.passwordsEnabled,
  })
}

const Body = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
  signOutOtherSessions: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const config = await getMembersConfig()
  if (!config.passwordsEnabled) {
    return NextResponse.json({ error: 'Password sign-in is not enabled for this site' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const { currentPassword, newPassword, signOutOtherSessions } = parsed.data

  const existing = await prisma.memberPassword.findUnique({ where: { memberId: member.id } })
  if (existing) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
    }
    const valid = await verifyPassword(currentPassword, existing.hash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
  }

  const pwResult = await validateNewPassword(newPassword)
  if (!pwResult.valid) {
    return NextResponse.json({ error: pwResult.reason ?? 'Password is not strong enough' }, { status: 400 })
  }

  const hash = await hashPassword(newPassword)
  await prisma.memberPassword.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, hash },
    update: { hash },
  })

  if (signOutOtherSessions) {
    const currentHash = await getCurrentMemberSessionTokenHash()
    await deleteAllMemberSessions(member.id, currentHash ?? undefined)
  }

  await notifyMemberSecurityAlert(member, existing ? 'Your password was changed.' : 'A password was added to your account.')

  const twoFactor = await prisma.memberTwoFactor.findFirst({ where: { memberId: member.id } })
  return NextResponse.json({ ok: true, twoFactorRequired: !twoFactor })
}

export async function DELETE() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  await prisma.memberPassword.deleteMany({ where: { memberId: member.id } })
  return NextResponse.json({ ok: true })
}
