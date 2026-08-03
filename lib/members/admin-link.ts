import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getOrCreateMembersRoleId } from '@/lib/members/default-role'
import {
  generateUsernameFromEmail,
  isUsernameAvailable,
  isUsernameFormatValid,
} from '@/lib/members/registration'

// Staff sign-in and member sign-in are separate identities on purpose (see
// MEMBERS_SPEC.md amendment 1): members share no table, cookie or token with
// admin Users. That separation is right for the credentials and wrong for the
// person holding them - an admin who opens /account is not a stranger, they
// just have no Member row. This module gives them one, keyed to their User, so
// the member area can carry on being Member-shaped without the admin session
// having to mean two things at once.
//
// It only ever runs behind a *validated* admin session, so the address on the
// User row is already proven (staff sign-in ends in an email code to it) - the
// same proof an ordinary member gives by consuming a sign-in link.

export type AdminMemberLink =
  | { ok: true; memberId: string }
  | { ok: false; reason: 'unavailable' }

// Signing out of the member area has to mean something even when the admin
// session that opened it is still live - otherwise the next page view signs
// them straight back in and "Sign out" reads as broken. Set on logout, cleared
// the next time they choose to continue as an admin. Session cookie: closing
// the browser is its own kind of signing out.
export const MEMBER_ADMIN_OPTOUT_COOKIE = 'cactus_member_admin_optout'

// Breaks the redirect loop that a rejected cookie would otherwise cause: the
// account page sends admins here, and here sends them back with a session. If
// that session cookie never comes back, the second visit lands on the sign-in
// page with an explanation instead of bouncing for ever.
export const MEMBER_ADMIN_ATTEMPT_COOKIE = 'cactus_member_admin_attempt'
export const MEMBER_ADMIN_ATTEMPT_MAX_AGE = 60

// The same guard again for a browser keeping no cookies at all, which would
// sail past the one above: sessions issued but never returned, round and round
// until the browser gives up. Counting what was just handed out needs nothing
// from the client, so it holds when everything else has been thrown away.
const RECENT_WINDOW_MS = 2 * 60 * 1000
const RECENT_LIMIT = 3

export async function tooManyRecentSessions(memberId: string): Promise<boolean> {
  const recent = await prisma.memberSession.count({
    where: { memberId, createdAt: { gt: new Date(Date.now() - RECENT_WINDOW_MS) } },
  })
  return recent >= RECENT_LIMIT
}

type StaffUser = { id: string; email: string; username: string; displayName: string | null }

// A handle the admin will recognise, when their staff one is free. Members and
// Users have separate username spaces, so the same string is usually available
// - and when it isn't, a generated one is better than failing the sign-in.
async function pickUsername(user: StaffUser): Promise<string> {
  const staffHandle = user.username.toLowerCase()
  if (isUsernameFormatValid(staffHandle) && (await isUsernameAvailable(staffHandle))) {
    return staffHandle
  }
  return generateUsernameFromEmail(user.email)
}

export async function findOrCreateMemberForUser(user: StaffUser): Promise<AdminMemberLink> {
  const linked = await prisma.member.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true },
  })
  if (linked) {
    // A suspended or deleted member is refused even to its own admin: lifting
    // that is an admin action taken in the Members screen, deliberately, not a
    // side effect of visiting the account page.
    if (linked.status !== 'ACTIVE') return { ok: false, reason: 'unavailable' }
    return { ok: true, memberId: linked.id }
  }

  // Registered as an ordinary member first, then hired (or simply signed up
  // with the same address before this link existed). Adopting the existing row
  // beats creating a second one that Member.email's unique index would reject
  // anyway. PENDING_VERIFICATION is settled at the same time: the address is
  // the one their staff sign-in already verifies.
  const byEmail = await prisma.member.findUnique({
    where: { email: user.email },
    select: { id: true, status: true, userId: true },
  })
  if (byEmail) {
    if (byEmail.userId && byEmail.userId !== user.id) return { ok: false, reason: 'unavailable' }
    if (byEmail.status === 'SUSPENDED' || byEmail.status === 'DELETED') {
      return { ok: false, reason: 'unavailable' }
    }
    await prisma.member.update({
      where: { id: byEmail.id },
      data: {
        userId: user.id,
        status: 'ACTIVE',
        emailVerified: true,
        ...(byEmail.status === 'PENDING_VERIFICATION' ? { emailVerifiedAt: new Date() } : {}),
      },
    })
    return { ok: true, memberId: byEmail.id }
  }

  const roleId = await getOrCreateMembersRoleId()
  try {
    const created = await prisma.member.create({
      data: {
        email: user.email,
        username: await pickUsername(user),
        displayName: user.displayName,
        status: 'ACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        roleId,
        userId: user.id,
      },
      select: { id: true },
    })
    return { ok: true, memberId: created.id }
  } catch (err) {
    // Two tabs, one admin: the loser of the race re-reads rather than 500s.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.member.findUnique({
        where: { userId: user.id },
        select: { id: true, status: true },
      })
      if (existing && existing.status === 'ACTIVE') return { ok: true, memberId: existing.id }
    }
    throw err
  }
}
