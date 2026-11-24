import { prisma } from '@/lib/db/prisma'
import { isBlocklisted } from '@/lib/config/path-blocklist'
import type { MembersConfig } from '@/lib/members/config'

// Member usernames keep the capitals their owner typed - "ChrisTG" shows as
// ChrisTG - but two names that differ only in capitals are the same name.
// Postgres enforces that with a unique index on lower("username") (init
// migration + prisma/core-reconcile/050), and every lookup below compares the
// same way, so /members/christg finds ChrisTG and nobody can register CHRISTG
// beside them. Prisma's own `mode: 'insensitive'` is not used for these: on
// Postgres it is a pattern match in which "_" - allowed in a username - is a
// wildcard, so chris_tg would also have matched chrisXtg.

const USERNAME_RE = /^[A-Za-z0-9_-]{2,32}$/

export const USERNAME_FORMAT_MESSAGE =
  'Usernames must be 2-32 characters: letters, numbers, hyphens and underscores only'

export function isUsernameFormatValid(username: string): boolean {
  return USERNAME_RE.test(username)
}

// Same name, different capitals. The one change a member may make at any time:
// it is still the same name, so the cooldown has nothing to protect and no
// redirect is needed (the old spelling already finds the profile).
export function isCaseOnlyUsernameChange(current: string, requested: string): boolean {
  return current !== requested && current.toLowerCase() === requested.toLowerCase()
}

// The member currently holding this name, whatever its capitals.
export async function findMemberIdByUsername(username: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Member" WHERE lower("username") = lower(${username}) LIMIT 1`
  return rows[0]?.id ?? null
}

// The member who gave this name up recently enough that it still forwards to
// them (and is still held for them - see isUsernameAvailable).
export async function findMemberIdByPreviousUsername(username: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Member"
    WHERE lower("previousUsername") = lower(${username})
      AND "previousUsernameExpiresAt" > NOW()
    LIMIT 1`
  return rows[0]?.id ?? null
}

// Free for this member to take. Refuses reserved words, a name somebody holds
// in any capitals, and a name somebody gave up inside the redirect window -
// handing that to a stranger would quietly point the old owner's links at
// someone else's profile. `exceptMemberId` lets a member take back their own
// previous name, or re-case their current one.
export async function isUsernameAvailable(
  username: string,
  opts: { exceptMemberId?: string } = {}
): Promise<boolean> {
  if (isBlocklisted(username)) return false
  const except = opts.exceptMemberId ?? ''
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Member"
    WHERE "id" <> ${except}
      AND (
        lower("username") = lower(${username})
        OR (lower("previousUsername") = lower(${username}) AND "previousUsernameExpiresAt" > NOW())
      )
    LIMIT 1`
  return rows.length === 0
}

// When this member may next change their username to a different name, or
// null if they may now. 0 days is no cooldown at all, not "until the moment
// they last changed it".
export function usernameCooldownEndsAt(
  usernameChangedAt: Date | null,
  config: Pick<MembersConfig, 'usernameChangeCooldownDays'>,
  now: Date = new Date()
): Date | null {
  if (!usernameChangedAt || config.usernameChangeCooldownDays <= 0) return null
  const endsAt = new Date(usernameChangedAt.getTime() + config.usernameChangeCooldownDays * 24 * 60 * 60 * 1000)
  return endsAt > now ? endsAt : null
}
