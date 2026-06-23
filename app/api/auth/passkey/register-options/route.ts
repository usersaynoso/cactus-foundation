import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { createRegistrationChallenge } from '@/lib/auth/passkey'
import { getSessionFromCookie } from '@/lib/auth/session'

const Body = z.object({
  // During setup: userId provided directly. After setup: read from session.
  userId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  let userId = parsed.data.userId ?? null

  if (!userId) {
    // Must be an authenticated user adding a new passkey
    const user = await getSessionFromCookie()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    userId = user.id
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { passkeys: { select: { credentialId: true, transports: true } } },
  })
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    const opts = await createRegistrationChallenge(
      userId,
      user.email,
      user.username,
      user.passkeys
    )
    return NextResponse.json(opts)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate registration options' },
      { status: 500 }
    )
  }
}
