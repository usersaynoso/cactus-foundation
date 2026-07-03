import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const passkeys = await prisma.memberPasskey.findMany({
    where: { memberId: member.id },
    select: { id: true, deviceName: true, transports: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ passkeys })
}
