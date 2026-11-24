import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { getMembersConfig, isAccountSectionEnabled } from '@/lib/members/config'
import { profileSectionOffResponse } from '@/lib/members/account-sections'
import {
  USERNAME_FORMAT_MESSAGE,
  isCaseOnlyUsernameChange,
  isUsernameAvailable,
  isUsernameFormatValid,
  usernameCooldownEndsAt,
} from '@/lib/members/username'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { getSiteTimezone } from '@/lib/config/timezone.server'
import { formatLongDate } from '@/lib/config/timezone'

const Body = z.object({ username: z.string().max(64) })

const DAY_MS = 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_username', [`ip:${ip}`, `account:${member.id}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  const config = await getMembersConfig()
  // The change form is on the profile page and nowhere else, so the section
  // switch gates this ahead of the username-specific one.
  if (!isAccountSectionEnabled(config, 'profile')) return profileSectionOffResponse()
  if (!config.usernameChangesEnabled) {
    return NextResponse.json({ error: 'Username changes are not enabled for this site' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  // Kept exactly as typed: capitals are the member's to choose.
  const username = parsed.data.username.trim()

  if (username === member.username) {
    return NextResponse.json({ error: 'That is already your username' }, { status: 400 })
  }
  if (!isUsernameFormatValid(username)) {
    return NextResponse.json({ error: USERNAME_FORMAT_MESSAGE }, { status: 400 })
  }

  // chris -> Chris is still the same name: no cooldown to wait out, nobody else
  // who could hold it (the name is unique whatever the capitals), and nothing
  // to forward, since the old spelling already finds the same profile. So it is
  // allowed at any time and leaves the change history alone - re-casing must
  // not start a fresh cooldown on a member's next real change either.
  if (isCaseOnlyUsernameChange(member.username, username)) {
    const updated = await prisma.member.update({
      where: { id: member.id },
      data: { username },
      select: { username: true },
    })
    return NextResponse.json({ username: updated.username })
  }

  const cooldownEndsAt = usernameCooldownEndsAt(member.usernameChangedAt, config)
  if (cooldownEndsAt) {
    const when = formatLongDate(cooldownEndsAt, await getSiteTimezone())
    return NextResponse.json(
      { error: `You can next change your username on ${when}. Changing only its capitals is fine at any time.` },
      { status: 429 }
    )
  }

  if (!(await isUsernameAvailable(username, { exceptMemberId: member.id }))) {
    return NextResponse.json({ error: `Username "${username}" is not available` }, { status: 409 })
  }

  const now = new Date()
  try {
    const updated = await prisma.member.update({
      where: { id: member.id },
      data: {
        username,
        usernameChangedAt: now,
        previousUsername: member.username,
        previousUsernameExpiresAt: new Date(now.getTime() + config.usernameRedirectDays * DAY_MS),
      },
      select: { username: true },
    })
    return NextResponse.json({ username: updated.username })
  } catch (err) {
    // Two people racing for the same name: the unique index settles it, and
    // the loser hears the same thing the availability check would have said.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: `Username "${username}" is not available` }, { status: 409 })
    }
    throw err
  }
}
