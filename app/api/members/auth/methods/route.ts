// Public: which sign-in methods a given email address can actually use.
//
// The member sign-in form is identifier-first - email address, Continue, and
// only then the methods that account has set up. A member who has never set a
// password or added a passkey is offered the sign-in link and nothing else,
// rather than three buttons of which two are dead ends.
//
// Enumeration note: this answers a narrower version of a question the rest of
// the member auth surface deliberately refuses (see
// passkey/authenticate-options, which returns a byte-identical challenge for
// everyone). Kept as tight as the feature allows: an address with no account
// behind it gets exactly the answer a magic-link-only member gets - by far the
// commonest member shape, since that is how every account starts - so "no
// account" and "plain account" are indistinguishable. Only members who have
// gone on to add a password or a passkey are distinguishable, and the route is
// rate limited per IP on top.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMembersConfig, isAuthMethodEnabled } from '@/lib/members/config'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'
import { isEmailConfigured } from '@/lib/config/env'

const Body = z.object({ email: z.string().email() })

export async function POST(request: NextRequest) {
  const config = await getMembersConfig()

  // What the site allows at all. A method the owner has switched off is never
  // offered, however the member's own account is set up.
  const siteAllows = {
    passkey: config.enabled && isAuthMethodEnabled(config, 'PASSKEY'),
    password: config.enabled && isAuthMethodEnabled(config, 'PASSWORD'),
    // Without mail configured the link would be requested, cheerfully
    // confirmed, and never arrive.
    magicLink: config.enabled && isAuthMethodEnabled(config, 'MAGIC_LINK') && isEmailConfigured(),
  }

  // The answer for a member with nothing set up, and therefore also the answer
  // for a rate-limited caller, an unparseable body, or an unknown address.
  const linkOnly = { passkey: false, password: false, magicLink: siteAllows.magicLink }

  const ip = await getClientIp(request)
  const rl = await checkAndRecord('member_auth_methods', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json(linkOnly)
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(linkOnly)
  }

  // Status isn't consulted here. Every method's own route already gates on it
  // (loginRejectionForStatus), and a suspended or unverified member needs the
  // real message from that route - "verify your email first" - not a sign-in
  // form that quietly pretends their passkey doesn't exist.
  const member = await prisma.member.findUnique({
    where: { email: parsed.data.email },
    select: {
      password: { select: { id: true } },
      passkeys: { select: { id: true }, take: 1 },
    },
  })
  if (!member) {
    return NextResponse.json(linkOnly)
  }

  return NextResponse.json({
    passkey: siteAllows.passkey && member.passkeys.length > 0,
    password: siteAllows.password && member.password !== null,
    magicLink: siteAllows.magicLink,
  })
}
