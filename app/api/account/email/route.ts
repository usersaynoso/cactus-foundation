import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { errorResponse } from '@/lib/utils'

const Body = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return errorResponse('Invalid input', 400)

  const { newEmail, currentPassword } = parsed.data

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  })
  if (!dbUser) return errorResponse('Not authenticated', 401)

  if (dbUser.passwordHash) {
    if (!currentPassword) return errorResponse('Current password is required to change your email', 400)
    const valid = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!valid) return errorResponse('Current password is incorrect', 400)
  }

  const conflict = await prisma.user.findFirst({
    where: { email: newEmail, NOT: { id: user.id } },
    select: { id: true },
  })
  if (conflict) return errorResponse('That email address is already in use', 409)

  await prisma.user.update({ where: { id: user.id }, data: { email: newEmail } })

  return NextResponse.json({ ok: true })
}
