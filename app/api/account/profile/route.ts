import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, username: true, displayName: true },
  })
  if (!dbUser) return errorResponse('Not authenticated', 401)

  return NextResponse.json(dbUser)
}

const Body = z.object({
  displayName: z.string().max(128).optional(),
})

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input', 400)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName ?? null },
  })

  return NextResponse.json({ ok: true })
}
