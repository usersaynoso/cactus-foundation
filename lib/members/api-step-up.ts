import { createHmac, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionSecret } from '@/lib/config/env'
import type { MemberRequestAuth } from '@/lib/members/api-auth'

// Step-up for member account calls made with a module's Bearer token.
//
// The web account asks for a recent sign-in (isCurrentMemberSessionFresh: the
// cookie session was created in the last ten minutes) before anything that
// plants or removes a way into the account. A token has no "signed in at"
// moment worth trusting - it was issued once and lives for months - so a token
// caller proves it is still the member another way, in the app, just before the
// change: by typing the account password, or a code emailed to the account's
// address (POST /api/members/step-up). That mints a grant:
//
//   - a random secret the app sends back as the `X-Cactus-Step-Up` header;
//   - valid for STEP_UP_TTL_MS (five minutes);
//   - bound to the member AND the credential that minted it (module name plus
//     the module's credential id), so it is useless from another device, another
//     member, or after that device's token is revoked;
//   - spent by the change it authorises: deleted in the same statement that
//     finds it, so two requests cannot both use one grant.
//
// Stored in WebAuthnChallenge, which already holds short-lived member-bound
// secrets with a purpose and an expiry (the admin passkey step-up grant lives
// there too), so no table is needed. Only an HMAC of the grant is kept, keyed
// with SESSION_SECRET and mixed with the member and credential, so reading the
// table yields nothing usable and a grant presented by the wrong credential
// simply hashes to a row that does not exist.
//
// Cookie callers never need a grant: their routes keep the rules they had.

export const STEP_UP_HEADER = 'x-cactus-step-up'
export const STEP_UP_TTL_MS = 5 * 60 * 1000
export const STEP_UP_PURPOSE = 'member_api_step_up'
const GRANT_PATTERN = /^csu_[A-Za-z0-9_-]{43}$/

type TokenAuth = Extract<MemberRequestAuth, { via: 'token' }>

function grantChallenge(auth: TokenAuth, grant: string): string {
  const digest = createHmac('sha256', getSessionSecret())
    .update(['member-api-step-up', auth.member.id, auth.moduleName, auth.credentialId, grant].join('\n'))
    .digest('hex')
  return `${STEP_UP_PURPOSE}:${digest}`
}

/** Mints a grant for this member and credential. The caller has just checked the password or code. */
export async function mintMemberStepUpGrant(auth: TokenAuth): Promise<{ grant: string; expiresAt: Date }> {
  const grant = `csu_${randomBytes(32).toString('base64url')}`
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS)
  // Tidy this member's spent-by-time grants while we are here; live ones from
  // the member's other devices are left alone.
  await prisma.webAuthnChallenge.deleteMany({
    where: { memberId: auth.member.id, purpose: STEP_UP_PURPOSE, expiresAt: { lte: new Date() } },
  })
  await prisma.webAuthnChallenge.create({
    data: { memberId: auth.member.id, challenge: grantChallenge(auth, grant), purpose: STEP_UP_PURPOSE, expiresAt },
  })
  return { grant, expiresAt }
}

function presentedGrant(request: Request): string | null {
  const value = request.headers.get(STEP_UP_HEADER)?.trim()
  return value && GRANT_PATTERN.test(value) ? value : null
}

function liveWhere(auth: TokenAuth, grant: string) {
  return {
    challenge: grantChallenge(auth, grant),
    memberId: auth.member.id,
    purpose: STEP_UP_PURPOSE,
    expiresAt: { gt: new Date() },
  }
}

export function stepUpRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'For your security, confirm it is you first, then try again.',
      stepUpRequired: true,
    },
    { status: 403 }
  )
}

/**
 * Early check, spends nothing: a token caller must carry a live grant before a
 * sensitive route even looks at its body (so a stolen token cannot use the
 * route's own password check as a guessing oracle). Null = carry on.
 */
export async function requireStepUpGrant(auth: MemberRequestAuth, request: Request): Promise<NextResponse | null> {
  if (auth.via === 'cookie') return null
  const grant = presentedGrant(request)
  if (!grant) return stepUpRequiredResponse()
  const live = await prisma.webAuthnChallenge.count({ where: liveWhere(auth, grant) })
  return live > 0 ? null : stepUpRequiredResponse()
}

/**
 * Spends the grant, immediately before the change it authorises. Null = spent
 * (or a cookie caller, who needs none). A grant already spent by a racing
 * request, or expired since the early check, fails here.
 */
export async function spendStepUpGrant(auth: MemberRequestAuth, request: Request): Promise<NextResponse | null> {
  if (auth.via === 'cookie') return null
  const grant = presentedGrant(request)
  if (!grant) return stepUpRequiredResponse()
  const { count } = await prisma.webAuthnChallenge.deleteMany({ where: liveWhere(auth, grant) })
  return count > 0 ? null : stepUpRequiredResponse()
}
