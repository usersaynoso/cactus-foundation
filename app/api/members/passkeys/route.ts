import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromRequest } from '@/lib/members/api-auth'

export async function GET(request: NextRequest) {
  const member = await getMemberFromRequest(request)
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const passkeys = await prisma.memberPasskey.findMany({
    where: { memberId: member.id },
    select: { id: true, deviceName: true, transports: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ passkeys })
}
