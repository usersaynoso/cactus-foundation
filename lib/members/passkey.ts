import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  GenerateRegistrationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server'
import { prisma } from '@/lib/db/prisma'
import { getWebAuthnRpId, getWebAuthnOrigin } from '@/lib/config/env'

// Mirrors lib/auth/passkey.ts against Member/MemberPasskey instead of
// User/Passkey, reusing the same WebAuthnChallenge table with memberId set
// (instead of userId) and the 'member_registration'/'member_authentication'
// purpose values (see MEMBERS_SPEC.md amendment 8).

const RP_NAME = 'Cactus Foundation'
const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function createMemberRegistrationChallenge(
  memberId: string,
  email: string,
  username: string,
  existingPasskeys: Array<{ credentialId: string; transports: string[] }>
) {
  const rpId = getWebAuthnRpId()

  const excludeCredentials = existingPasskeys.map((pk) => ({
    id: pk.credentialId,
    transports: pk.transports as AuthenticatorTransportFuture[],
  }))

  // Stable user handle across attempts — see lib/auth/passkey.ts for why.
  const userID = new TextEncoder().encode(memberId)

  const opts = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId,
    userName: email,
    userDisplayName: username,
    userID,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  } satisfies GenerateRegistrationOptionsOpts)

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  await prisma.webAuthnChallenge.create({
    data: {
      memberId,
      challenge: opts.challenge,
      purpose: 'member_registration',
      expiresAt,
    },
  })

  return opts
}

export async function verifyMemberRegistration(
  challenge: string,
  response: Parameters<typeof verifyRegistrationResponse>[0]['response']
) {
  const stored = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  if (!stored || stored.purpose !== 'member_registration' || stored.expiresAt < new Date()) {
    await prisma.webAuthnChallenge.deleteMany({ where: { challenge } })
    throw new Error('Invalid or expired challenge')
  }

  await prisma.webAuthnChallenge.delete({ where: { challenge } })

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
    requireUserVerification: false,
  } satisfies VerifyRegistrationResponseOpts)

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Registration verification failed')
  }

  return { verification, memberId: stored.memberId }
}

export async function saveMemberPasskey(
  memberId: string,
  info: NonNullable<
    Awaited<ReturnType<typeof verifyRegistrationResponse>>['registrationInfo']
  >,
  transports: AuthenticatorTransportFuture[],
  deviceName?: string
) {
  await prisma.memberPasskey.create({
    data: {
      memberId,
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey),
      counter: BigInt(info.credential.counter),
      transports: transports as string[],
      deviceName: deviceName ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function createMemberAuthenticationChallenge(memberId?: string) {
  const rpId = getWebAuthnRpId()

  let allowCredentials: GenerateRegistrationOptionsOpts['excludeCredentials']
  if (memberId) {
    const passkeys = await prisma.memberPasskey.findMany({ where: { memberId } })
    allowCredentials = passkeys.map((pk) => ({
      id: pk.credentialId,
      transports: pk.transports as AuthenticatorTransportFuture[],
    }))
  }

  const opts = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: allowCredentials ?? [],
    userVerification: 'preferred',
  })

  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS)
  await prisma.webAuthnChallenge.create({
    data: {
      memberId: memberId ?? null,
      challenge: opts.challenge,
      purpose: 'member_authentication',
      expiresAt,
    },
  })

  return opts
}

export async function verifyMemberAuthentication(
  challenge: string,
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response']
) {
  const stored = await prisma.webAuthnChallenge.findUnique({ where: { challenge } })
  if (!stored || stored.purpose !== 'member_authentication' || stored.expiresAt < new Date()) {
    await prisma.webAuthnChallenge.deleteMany({ where: { challenge } })
    throw new Error('Invalid or expired challenge')
  }

  const credentialId = response.id
  const passkey = await prisma.memberPasskey.findUnique({
    where: { credentialId },
    include: { member: true },
  })
  if (!passkey) {
    await prisma.webAuthnChallenge.delete({ where: { challenge } })
    throw new Error('Passkey not found')
  }

  await prisma.webAuthnChallenge.delete({ where: { challenge } })

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
    credential: {
      id: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: Number(passkey.counter),
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  } satisfies VerifyAuthenticationResponseOpts)

  if (!verification.verified || !verification.authenticationInfo) {
    throw new Error('Authentication verification failed')
  }

  await prisma.memberPasskey.update({
    where: { id: passkey.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  })

  return { verification, member: passkey.member }
}
