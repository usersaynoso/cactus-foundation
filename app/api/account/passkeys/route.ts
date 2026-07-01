import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { id: true, createdAt: true, transports: true, label: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ passkeys })
}
