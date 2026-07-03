import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createMemberAuthenticationChallenge } from '@/lib/members/passkey'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({
  email: z.string().email().optional(),
})

export async function POST(request: NextRequest) {
  const ip = await getClientIp(request)
  const rl = await checkAndRecord('passkey_authenticate', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})))

  // Only short-circuit to "no passkeys" for an ACTIVE member with a resolvable
  // email — anything else (not found, or found but not ACTIVE) falls through
  // to a generic unscoped challenge, so the response shape never reveals
  // whether an email belongs to a suspended/pending/nonexistent account.
  if (parsed.success && parsed.data.email) {
    const member = await prisma.member.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, status: true },
    })
    if (member?.status === 'ACTIVE') {
      const count = await prisma.memberPasskey.count({ where: { memberId: member.id } })
      if (count === 0) {
        return NextResponse.json({ noPasskeys: true })
      }
      try {
        const opts = await createMemberAuthenticationChallenge(member.id)
        return NextResponse.json(opts)
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate challenge' }, { status: 500 })
      }
    }
  }

  try {
    const opts = await createMemberAuthenticationChallenge()
    return NextResponse.json(opts)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate challenge' }, { status: 500 })
  }
}
