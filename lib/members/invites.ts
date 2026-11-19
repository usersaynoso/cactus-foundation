import { prisma } from '@/lib/db/prisma'
import { getMemberAreaPath } from '@/lib/members/paths'
import { generateMemberToken, hashMemberToken } from '@/lib/members/tokens'

// Minting a member invite: the one-time registration link an invite-only site
// hands out. Only the token's sha256 is stored (MemberInvite.tokenHash); the raw
// token exists in the returned link and nowhere else, so it cannot be shown
// again later. Validation and use live in lib/members/registration.ts.
//
// This does NO permission check of its own, on purpose. Core's admin route
// (POST /api/admin/members/invites) checks `members.invite` first; a module that
// lets somebody else invite (a member inviting a friend, say) calls this after
// its OWN check, with its own rules about who may. Whoever calls it has already
// decided the invite should exist.

export const DEFAULT_INVITE_EXPIRY_DAYS = 7
export const MAX_INVITE_EXPIRY_DAYS = 365

export type CreateMemberInviteInput = {
  /** The staff User who made it, when there is one. Null or left off for an
   * invite made by anybody else (a member, a module job). */
  createdById?: string | null
  /** Shown on the admin invites list as who made it. Free text. */
  createdByName: string
  /** Whole days from now, 1 to 365. Defaults to 7. */
  expiresInDays?: number
}

export type CreatedMemberInvite = {
  /** Absolute registration link carrying the raw token. */
  inviteUrl: string
  /** The raw token. Only its hash is stored, so this is the only copy. */
  token: string
  expiresAt: Date
}

export async function createMemberInvite(input: CreateMemberInviteInput): Promise<CreatedMemberInvite> {
  const days = input.expiresInDays ?? DEFAULT_INVITE_EXPIRY_DAYS
  if (!Number.isInteger(days) || days < 1 || days > MAX_INVITE_EXPIRY_DAYS) {
    throw new RangeError(`expiresInDays must be a whole number from 1 to ${MAX_INVITE_EXPIRY_DAYS}`)
  }

  const token = generateMemberToken()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  await prisma.memberInvite.create({
    data: {
      tokenHash: hashMemberToken(token),
      createdById: input.createdById ?? null,
      createdByName: input.createdByName,
      expiresAt,
    },
  })

  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
  const inviteUrl = `${siteUrl}/${getMemberAreaPath()}/register?invite=${token}`

  return { inviteUrl, token, expiresAt }
}
