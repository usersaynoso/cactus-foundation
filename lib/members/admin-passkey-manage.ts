import { randomBytes } from 'crypto'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import type {
  AuthenticatorTransportFuture,
  VerifyAuthenticationResponseOpts,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { Member } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getWebAuthnOrigins, getWebAuthnRpId } from '@/lib/config/env'
import type { MembersConfig } from '@/lib/members/config'
import { decideLinkedMember, isLinkedAdminPasskeyEnabled, normaliseLinkEmail } from '@/lib/members/admin-passkey-link'

// Managing an admin's own admin passkeys from their member security page.
//
// With "Admins can use their admin passkey to sign in to their member account"
// on, the admin behind a member account (same verified address, the rules in
// admin-passkey-link.ts) sees their admin passkeys on the member security page,
// can remove them, and a passkey they add there is saved as an admin passkey
// as well as a member one.
//
// That is the one place a member session can touch a staff credential, so it
// is not allowed on the member session alone: a member session is far easier
// to come by than an admin one (a borrowed browser, a public-site script), and
// on its own it could plant a passkey that opens the admin area, or remove the
// real ones. Every change therefore needs a fresh confirmation with one of the
// admin's existing passkeys - a WebAuthn assertion verified against the admin
// table - which buys a one-use grant valid for GRANT_TTL_MS. An admin with no
// admin passkey yet cannot confirm, so the member page adds member passkeys
// only, exactly as before.

const STEP_UP_PURPOSE = 'member_admin_stepup'
const GRANT_PURPOSE = 'member_admin_grant'
const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const ADMIN_PASSKEY_GRANT_TTL_MS = 5 * 60 * 1000

export type LinkedAdmin = { id: string; email: string; hasPassword: boolean }

// The admin account behind this member, when the site allows the link and the
// link rules accept it. Null otherwise - including when two admins share the
// address, which decideLinkedMember's "exactly one" rule never resolves.
export async function findLinkedAdminForMember(member: Member, config: MembersConfig): Promise<LinkedAdmin | null> {
  if (!isLinkedAdminPasskeyEnabled(config)) return null
  const address = normaliseLinkEmail(member.email)
  if (!address) return null
  const admins = await prisma.user.findMany({
    where: { email: { equals: address, mode: 'insensitive' } },
    select: { id: true, email: true, emailVerifiedAt: true, suspendedAt: true, passwordHash: true },
    take: 2,
  })
  const sameAddress = admins.filter((u) => normaliseLinkEmail(u.email) === address)
  const [admin] = sameAddress
  if (!admin || sameAddress.length !== 1) return null
  const candidates = await prisma.member.findMany({
    where: { email: { equals: address, mode: 'insensitive' } },
    take: 2,
  })
  const decision = decideLinkedMember(admin, candidates)
  if (!decision.ok || decision.memberId !== member.id) return null
  return { id: admin.id, email: admin.email, hasPassword: !!admin.passwordHash }
}

export async function listAdminPasskeys(userId: string) {
  return prisma.passkey.findMany({
    where: { userId },
    select: { id: true, label: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createAdminStepUpChallenge(memberId: string, userId: string) {
  const passkeys = await prisma.passkey.findMany({ where: { userId }, select: { credentialId: true, transports: true } })
  if (passkeys.length === 0) return null
  const opts = await generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    allowCredentials: passkeys.map((pk) => ({
      id: pk.credentialId,
      transports: pk.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: 'required',
  })
  await prisma.webAuthnChallenge.create({
    data: {
      memberId,
      userId,
      challenge: opts.challenge,
      purpose: STEP_UP_PURPOSE,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  })
  return opts
}

type AuthResponse = Parameters<typeof verifyAuthenticationResponse>[0]['response']

// Verifies the confirmation and issues the grant. False for every failure.
export async function verifyAdminStepUp(memberId: string, userId: string, response: AuthResponse): Promise<boolean> {
  let challenge = ''
  try {
    const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64').toString('utf8')) as {
      challenge?: string
    }
    challenge = clientData.challenge ?? ''
  } catch {
    return false
  }
  if (!challenge) return false

  const stored = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  // Spent whatever happens next: a confirmation is good for one attempt.
  await prisma.webAuthnChallenge.deleteMany({ where: { challenge } })
  if (
    !stored ||
    stored.purpose !== STEP_UP_PURPOSE ||
    stored.expiresAt < new Date() ||
    stored.memberId !== memberId ||
    stored.userId !== userId
  ) {
    return false
  }

  const passkey = await prisma.passkey.findUnique({ where: { credentialId: response.id } })
  if (!passkey || passkey.userId !== userId) return false

  try {
    const verification = await verifyAuthenticationResponse({
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
    if (!verification.verified || !verification.authenticationInfo) return false
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) },
    })
  } catch {
    return false
  }

  // One grant at a time per member: a fresh confirmation replaces any older one.
  await prisma.webAuthnChallenge.deleteMany({ where: { memberId, purpose: GRANT_PURPOSE } })
  await prisma.webAuthnChallenge.create({
    data: {
      memberId,
      userId,
      challenge: `grant_${randomBytes(24).toString('hex')}`,
      purpose: GRANT_PURPOSE,
      expiresAt: new Date(Date.now() + ADMIN_PASSKEY_GRANT_TTL_MS),
    },
  })
  return true
}

// Spends the grant, if there is a live one for this member and admin. Deleted
// in the same statement that checks it, so two requests cannot both spend it.
export async function consumeAdminStepUpGrant(memberId: string, userId: string): Promise<boolean> {
  const { count } = await prisma.webAuthnChallenge.deleteMany({
    where: { memberId, userId, purpose: GRANT_PURPOSE, expiresAt: { gt: new Date() } },
  })
  return count > 0
}

// The admin copy of a passkey just registered on the member page. Same
// credential, its own row and counter in the admin table, so it opens the
// admin area like any passkey added there. Skipped if that credential is
// somehow already on the admin account.
export async function saveAdminCopyOfPasskey(
  userId: string,
  info: NonNullable<Awaited<ReturnType<typeof verifyRegistrationResponse>>['registrationInfo']>,
  transports: AuthenticatorTransportFuture[],
  label: string | undefined
): Promise<void> {
  const existing = await prisma.passkey.findUnique({ where: { credentialId: info.credential.id }, select: { id: true } })
  if (existing) return
  await prisma.passkey.create({
    data: {
      userId,
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: BigInt(info.credential.counter),
      transports: transports as string[],
      label: label ?? null,
    },
  })
}

// Same rule the admin area applies to removing a passkey: the last one only
// goes if the admin has a password to fall back on.
export async function adminPasskeyRemovalBlocked(admin: LinkedAdmin, passkeyId: string): Promise<string | null> {
  const remaining = await prisma.passkey.count({ where: { userId: admin.id, NOT: { id: passkeyId } } })
  if (remaining > 0 || admin.hasPassword) return null
  return 'That is your only admin passkey and your admin account has no password, so removing it would lock you out of the admin area.'
}
