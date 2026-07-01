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

const RP_NAME = 'Cactus Foundation'
const CHALLENGE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function createRegistrationChallenge(
  userId: string | null,
  email: string,
  username: string,
  existingPasskeys: Array<{ credentialId: string; transports: string[] }>
) {
  const rpId = getWebAuthnRpId()

  const excludeCredentials = existingPasskeys.map((pk) => ({
    id: pk.credentialId,
    transports: pk.transports as AuthenticatorTransportFuture[],
  }))

  // Encode userId as bytes so the WebAuthn user handle is stable for this user
  // across multiple registration attempts. Without this, each attempt uses a fresh
  // random user.id, which causes Safari (iCloud Keychain) to conflict with any
  // previously stored passkey for the same rpId and user.name.
  const userID = userId ? new TextEncoder().encode(userId) : undefined

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
      userId,
      challenge: opts.challenge,
      purpose: 'registration',
      expiresAt,
    },
  })

  return opts
}

export async function verifyRegistration(
  challenge: string,
  response: Parameters<typeof verifyRegistrationResponse>[0]['response']
) {
  const stored = await prisma.webAuthnChallenge.findUnique({
    where: { challenge },
  })
  if (!stored || stored.purpose !== 'registration' || stored.expiresAt < new Date()) {
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

  return { verification, userId: stored.userId }
}

export function labelFromUserAgent(ua: string): string {
  const s = ua.toLowerCase()

  const os =
    /iphone|ipad|ipod/.test(s) ? 'iOS' :
    /android/.test(s) ? 'Android' :
    /mac os x|macintosh/.test(s) ? 'macOS' :
    /windows/.test(s) ? 'Windows' :
    /linux/.test(s) ? 'Linux' :
    'Unknown OS'

  const browser =
    /edg\//.test(s) ? 'Edge' :
    /opr\/|opera/.test(s) ? 'Opera' :
    /chrome\//.test(s) ? 'Chrome' :
    /firefox\//.test(s) ? 'Firefox' :
    /safari\//.test(s) ? 'Safari' :
    'Unknown browser'

  return `${browser} on ${os}`
}

export async function savePasskey(
  userId: string,
  info: NonNullable<
    Awaited<ReturnType<typeof verifyRegistrationResponse>>['registrationInfo']
  >,
  transports: AuthenticatorTransportFuture[],
  label?: string
) {
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

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function createAuthenticationChallenge(userId?: string) {
  const rpId = getWebAuthnRpId()

  let allowCredentials: GenerateRegistrationOptionsOpts['excludeCredentials']
  if (userId) {
    const passkeys = await prisma.passkey.findMany({ where: { userId } })
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
      userId: userId ?? null,
      challenge: opts.challenge,
      purpose: 'authentication',
      expiresAt,
    },
  })

  return opts
}

export async function verifyAuthentication(
  challenge: string,
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response']
) {
  const stored = await prisma.webAuthnChallenge.findUnique({
    where: { challenge },
  })
  if (!stored || stored.purpose !== 'authentication' || stored.expiresAt < new Date()) {
    await prisma.webAuthnChallenge.deleteMany({ where: { challenge } })
    throw new Error('Invalid or expired challenge')
  }

  // Find the passkey being used
  const credentialId = response.id
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId },
    include: { user: true },
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

  // Update counter
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter) },
  })

  return { verification, user: passkey.user }
}
