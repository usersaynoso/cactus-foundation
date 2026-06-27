import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createAuthenticationChallenge } from '@/lib/auth/passkey'
import { checkAndRecord, getClientIp } from '@/lib/auth/rate-limit'

const Body = z.object({
  email: z.string().email().optional(),
})

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rl = await checkAndRecord('passkey_authenticate', [`ip:${ip}`])
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  let userId: string | undefined

  if (parsed.success && parsed.data.email) {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
    userId = user?.id

    if (userId) {
      const count = await prisma.passkey.count({ where: { userId } })
      if (count === 0) {
        return NextResponse.json({ noPasskeys: true, userId })
      }
    }
  }

  try {
    const opts = await createAuthenticationChallenge(userId)
    return NextResponse.json(opts)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate challenge' }, { status: 500 })
  }
}
