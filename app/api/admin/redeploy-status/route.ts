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
  // Activate any modules that finished deploying and release any lingering lock
  await prisma.deployLock.deleteMany({})
  await prisma.module.updateMany({
    where: { status: 'deploying' },
    data: { status: 'active' },
  })
  return NextResponse.json({ ok: true })
}
