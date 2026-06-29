import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { pendingRedeployId: true, adminPath: true },
  })
  return NextResponse.json({
    deploymentId: config?.pendingRedeployId ?? null,
    adminPath: config?.adminPath ?? '',
  })
}

export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { pendingRedeployId: null },
  })
  invalidateSiteConfigCache()
  return NextResponse.json({ ok: true })
}
