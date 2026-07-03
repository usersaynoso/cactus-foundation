import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createMemberRegistrationChallenge } from '@/lib/members/passkey'
import { getMemberFromCookie } from '@/lib/members/session'

// Adds an additional passkey to the signed-in member's account. Unlike the
// admin flow, there is no "zero-passkey bootstrap" for members: a member's
// first session always comes from magic link (or password, if enabled) -
// see MEMBERS_SPEC.md Authentication. Trusting a bare memberId from the
// request body (as the admin setup-wizard bootstrap does) would let anyone
// who knows/guesses a member's id attach their own passkey to that account,
// with no narrow one-time setup window to contain it the way admin setup has.
export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
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
