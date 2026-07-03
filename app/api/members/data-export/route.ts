import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getMemberFromCookie } from '@/lib/members/session'
import { createDataExportRequest } from '@/lib/members/export'

// Assembly (incl. module fetches) runs synchronously within the request.
export const maxDuration = 60

export async function GET() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const latest = await prisma.memberDataExportRequest.findFirst({
    where: { memberId: member.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, createdAt: true, completedAt: true, expiresAt: true },
  })

  return NextResponse.json({ request: latest })
}

export async function POST() {
  const member = await getMemberFromCookie()
  if (!member) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const request = await createDataExportRequest(member.id)
    return NextResponse.json({ status: request.status, expiresAt: request.expiresAt })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 400 })
  }
}
