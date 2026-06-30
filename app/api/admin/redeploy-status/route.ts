import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { invalidateSiteConfigCache, getPendingRedeployIdUncached, getAdminPathCached } from '@/lib/config/site'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  const [deploymentId, adminPath] = await Promise.all([
    getPendingRedeployIdUncached(),
    getAdminPathCached(),
  ])
  return NextResponse.json({
    deploymentId,
    adminPath: adminPath ?? '',
  })
}

export async function DELETE() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { pendingRedeployId: null, pendingRedeployAt: null },
  })
  invalidateSiteConfigCache()
  // Activate any modules that finished deploying and release any lingering lock
  await prisma.deployLock.deleteMany({})
  await prisma.module.updateMany({
    where: { status: 'deploying' },
    data: { status: 'active' },
  })
  return NextResponse.json({ ok: true })
}
