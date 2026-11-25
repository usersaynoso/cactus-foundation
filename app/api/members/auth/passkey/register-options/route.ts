import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createMemberRegistrationChallenge } from '@/lib/members/passkey'
import { isCurrentMemberSessionFresh } from '@/lib/members/session'
import { getMemberAuthFromRequest } from '@/lib/members/api-auth'
import { spendStepUpGrant } from '@/lib/members/api-step-up'

// Adds an additional passkey to the signed-in member's account. Unlike the
// admin flow, there is no "zero-passkey bootstrap" for members: a member's
// first session always comes from magic link (or password, if enabled) -
// see MEMBERS_SPEC.md Authentication. Trusting a bare memberId from the
// request body (as the admin setup-wizard bootstrap does) would let anyone
// who knows/guesses a member's id attach their own passkey to that account,
// with no narrow one-time setup window to contain it the way admin setup has.
//
// An app (a module token, lib/members/api-auth.ts) spends a step-up grant here
// instead of the fresh-session rule. The challenge minted below is bound to
// this member and lasts five minutes, so register-verify needs no second grant.
export async function POST(request: NextRequest) {
  const auth = await getMemberAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  const { member } = auth

  // Step-up: adding a passkey is durable persistence, so fail early if the
  // session isn't freshly authenticated. register-verify re-checks this.
  if (auth.via === 'cookie') {
    if (!(await isCurrentMemberSessionFresh())) {
      return NextResponse.json(
        { error: 'For your security, please sign in again before adding a new passkey.', reauthRequired: true },
        { status: 403 }
      )
    }
  } else {
    const spent = await spendStepUpGrant(auth, request)
    if (spent) return spent
  }

  const passkeys = await prisma.memberPasskey.findMany({
    where: { memberId: member.id },
    select: { credentialId: true, transports: true },
  })

  try {
    const opts = await createMemberRegistrationChallenge(
      member.id,
      member.email,
      member.username,
      passkeys
    )
    return NextResponse.json(opts)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate registration options' },
      { status: 500 }
    )
  }
}
