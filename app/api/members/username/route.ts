import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig } from '@/lib/members/config'
import { isUsernameFormatValid, isUsernameAvailable } from '@/lib/members/registration'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({ username: z.string() })

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_username', [`ip:${ip}`, `account:${member.id}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const config = await getMembersConfig()
  if (!config.usernameChangesEnabled) {
    return NextResponse.json({ error: 'Username changes are not enabled for this site' }, { status: 403 })
  }

  if (member.usernameChangedAt) {
    const cooldownMs = config.usernameChangeCooldownDays * 24 * 60 * 60 * 1000
    const nextAllowed = new Date(member.usernameChangedAt.getTime() + cooldownMs)
    if (nextAllowed > new Date()) {
      return NextResponse.json(
        { error: `You can next change your username on ${nextAllowed.toLocaleDateString()}` },
        { status: 429 }
      )
    }
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const username = parsed.data.username.toLowerCase()

  if (username === member.username) {
    return NextResponse.json({ error: 'That is already your username' }, { status: 400 })
  }
  if (!isUsernameFormatValid(username)) {
    return NextResponse.json(
      { error: 'Usernames must be 2-32 characters: lowercase letters, numbers, hyphens and underscores only' },
      { status: 400 }
    )
  }
  if (!(await isUsernameAvailable(username))) {
    return NextResponse.json({ error: `Username "${username}" is not available` }, { status: 409 })
  }

  const now = new Date()
  const updated = await prisma.member.update({
    where: { id: member.id },
    data: {
      username,
      usernameChangedAt: now,
      previousUsername: member.username,
      previousUsernameExpiresAt: new Date(now.getTime() + config.usernameRedirectDays * 24 * 60 * 60 * 1000),
    },
    select: { username: true },
  })

  return NextResponse.json({ username: updated.username })
}
