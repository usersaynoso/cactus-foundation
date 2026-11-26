import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import type {
  AuthenticatorTransportFuture,
  VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server'
import type { Member, MemberStatus } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getWebAuthnRpId, getWebAuthnOrigins } from '@/lib/config/env'
import { isAuthMethodEnabled, type MembersConfig } from '@/lib/members/config'

// "Admins can use their admin passkey to sign in to their member account".
//
// Staff accounts (User + Passkey) and member accounts (Member + MemberPasskey)
// are separate identities on purpose (MEMBERS_SPEC.md amendment 1). A site
// owner who is also a member of their own site would otherwise need a second
// passkey for the same domain, for the same person, held on the same phone.
// With this setting on, the member passkey ceremony also accepts a credential
// from the admin Passkey table and signs in the Member with the same verified
// address.
//
// Strictly one way: an admin passkey can open a member session, never the
// reverse. Nothing here is imported by the staff sign-in path, and the admin
// rows are only ever read (plus the signature counter, which the ceremony has
// to advance to keep replay protection honest).
//
// Every refusal is reported to the caller as "no match", which the ceremony
// turns into the very same "Passkey not found" an unknown credential gets - so
// the answer never says whether an admin, a member, or neither sits behind an
// address or a credential.

// Off unless the site owner turns it on, and meaningless while members or the
// member passkey method are off.
export function isLinkedAdminPasskeyEnabled(config: MembersConfig): boolean {
  return (
    config.enabled &&
    isAuthMethodEnabled(config, 'PASSKEY') &&
    config.adminPasskeySignInForMembers === true
  )
}

export function normaliseLinkEmail(email: string): string {
  return email.trim().toLowerCase()
}

export type LinkAdminUser = {
  id: string
  email: string
  emailVerifiedAt: Date | null
  suspendedAt: Date | null
}

export type LinkMemberCandidate = {
  id: string
  email: string
  emailVerified: boolean
  status: MemberStatus
  userId: string | null
}

export type LinkDecision =
  | { ok: true; memberId: string }
  | {
      ok: false
      reason:
        | 'admin_unverified'
        | 'admin_suspended'
        | 'no_member'
        | 'ambiguous'
        | 'member_unverified'
        | 'member_unavailable'
        | 'linked_elsewhere'
    }

// Pure, so every refusal can be tested without a database. `candidates` is
// whatever a case-insensitive lookup on the admin's address found; the address
// is compared again here, trimmed and lower-cased, so a lookup that was too
// generous cannot widen the match.
export function decideLinkedMember(
  admin: LinkAdminUser,
  candidates: LinkMemberCandidate[]
): LinkDecision {
  if (!admin.emailVerifiedAt) return { ok: false, reason: 'admin_unverified' }
  if (admin.suspendedAt) return { ok: false, reason: 'admin_suspended' }

  const address = normaliseLinkEmail(admin.email)
  if (!address) return { ok: false, reason: 'no_member' }
  const matches = candidates.filter((m) => normaliseLinkEmail(m.email) === address)
  if (matches.length > 1) return { ok: false, reason: 'ambiguous' }
  const [member] = matches
  if (!member) return { ok: false, reason: 'no_member' }
  if (!member.emailVerified || member.status === 'PENDING_VERIFICATION') {
    return { ok: false, reason: 'member_unverified' }
  }
  if (member.status === 'SUSPENDED' || member.status === 'DELETED') {
    return { ok: false, reason: 'member_unavailable' }
  }
  // A member already tied to a different staff account (lib/members/admin-link)
  // is that person's, whatever its address now says.
  if (member.userId && member.userId !== admin.id) {
    return { ok: false, reason: 'linked_elsewhere' }
  }
  return { ok: true, memberId: member.id }
}

// Two rows are fetched so "exactly one" can be checked: Member.email is unique
// but case-sensitive, so differently-cased duplicates are possible in principle.
async function findMemberCandidates(email: string): Promise<Member[]> {
  const address = normaliseLinkEmail(email)
  if (!address) return []
  return prisma.member.findMany({
    where: { email: { equals: address, mode: 'insensitive' } },
    take: 2,
  })
}

async function resolveLinkedMember(admin: LinkAdminUser): Promise<Member | null> {
  const candidates = await findMemberCandidates(admin.email)
  const decision = decideLinkedMember(admin, candidates)
  if (!decision.ok) return null
  return candidates.find((m) => m.id === decision.memberId) ?? null
}

// For the identifier-first sign-in form (/api/members/auth/methods): does this
// member - already found by the address they typed - have a usable admin
// passkey behind the same address? Only ever asked about a member that exists,
// so an address with no member behind it gets the same answer as before and
// says nothing about whether an admin holds it.
export async function memberHasLinkedAdminPasskey(member: LinkMemberCandidate): Promise<boolean> {
  const address = normaliseLinkEmail(member.email)
  if (!address) return false
  const admins = await prisma.user.findMany({
    where: { email: { equals: address, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      suspendedAt: true,
      passkeys: { select: { id: true }, take: 1 },
    },
    take: 2,
  })
  const sameAddress = admins.filter((u) => normaliseLinkEmail(u.email) === address)
  const [admin] = sameAddress
  if (!admin || sameAddress.length !== 1) return false
  if (admin.passkeys.length === 0) return false

  // Re-run the full rule from the admin's side, so "exactly one member" is
  // judged the same way here as at sign-in.
  const candidates = await findMemberCandidates(admin.email)
  const decision = decideLinkedMember(admin, candidates)
  return decision.ok && decision.memberId === member.id
}

type AuthResponse = Parameters<typeof verifyAuthenticationResponse>[0]['response']

// The admin-credential leg of the member passkey ceremony. The caller has
// already validated and consumed the challenge and found no MemberPasskey with
// this credential id. Returns null for every failure - unknown credential, bad
// signature, missing user verification, or a link the rules refuse - so the
// caller can answer exactly as it does for an unknown credential.
//
// The signature is checked before the link rules so that someone holding only
// a credential id learns nothing from the difference between "no member" and
// "bad signature": both come back null.
export async function verifyLinkedAdminPasskey(
  challenge: string,
  response: AuthResponse,
  scopedMemberId: string | null
): Promise<{
  verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  member: Member
} | null> {
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
    include: {
      user: { select: { id: true, email: true, emailVerifiedAt: true, suspendedAt: true } },
    },
  })
  if (!passkey) return null

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: getWebAuthnOrigins(),
      expectedRPID: getWebAuthnRpId(),
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: Number(passkey.counter),
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
      requireUserVerification: true,
    } satisfies VerifyAuthenticationResponseOpts)
  } catch {
    return null
  }
  if (!verification.verified || !verification.authenticationInfo) return null

  const member = await resolveLinkedMember(passkey.user)
  if (!member) return null
  // A challenge issued for one member must not be spent on another.
  if (scopedMemberId && scopedMemberId !== member.id) return null

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  })

  return { verification, member }
}
