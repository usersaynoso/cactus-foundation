import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { isBlocklisted } from '@/lib/config/site'
import { syncToEdgeConfig } from '@/lib/config/edge-config'
import { invalidateSiteConfigCache } from '@/lib/config/site'
import { errorResponse } from '@/lib/utils'
import type { SiteStatus } from '@prisma/client'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)

  const config = await prisma.siteConfig.findUnique({ where: { id: 'singleton' } })
  if (!config) return errorResponse('Config not found', 404)

  // Never expose sensitive hashes
  const { recoveryCodeHash: _, ...safe } = config
  return NextResponse.json(safe)
}

const Patch = z.object({
  siteName: z.string().min(1).max(100).optional(),
  tagline: z.string().max(200).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  dateFormat: z.string().optional(),
  timeFormat: z.string().optional(),
  adminPath: z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).optional(),
  status: z.enum(['live', 'comingSoon', 'maintenance']).optional(),
  hideFromCrawlers: z.boolean().optional(),
  publicRegistration: z.boolean().optional(),
  defaultRoleId: z.string().optional().nullable(),
  trustDeviceDays: z.number().int().min(1).max(365).optional(),
  emailFromName: z.string().max(100).optional().nullable(),
  emailFromAddress: z.string().email().optional().nullable(),
  emailProvider: z.string().optional().nullable(),
  mediaProvider: z
    .enum(['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE', 'CLOUDINARY', 'IMAGEKIT'])
    .optional()
    .nullable(),
  privacyPolicyPageId: z.string().optional().nullable(),
  termsPageId: z.string().optional().nullable(),
  sessionPurgeAfterDays: z.number().int().min(1).max(365).optional(),
  recoveryPurgeAfterDays: z.number().int().min(1).max(30).optional(),
  mainMenuId: z.string().optional().nullable(),
  homepageId: z.string().optional().nullable(),
})

export async function PATCH(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const parsed = Patch.safeParse(await request.json())
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { adminPath, status, mainMenuId, homepageId, ...rest } = parsed.data

  if (adminPath && isBlocklisted(adminPath)) {
    return errorResponse(`"${adminPath}" is a reserved path`)
  }

  const data: Record<string, unknown> = { ...rest }
  if (adminPath) data.adminPath = adminPath
  if (status) data.status = status
  if (mainMenuId !== undefined) data.mainMenuId = mainMenuId
  if (homepageId !== undefined) data.homepageId = homepageId

  const updated = await prisma.siteConfig.update({ where: { id: 'singleton' }, data })

  // Mirror changes to Edge Config
  const edgeUpdates: { adminPath?: string; siteStatus?: SiteStatus } = {}
  if (adminPath) edgeUpdates.adminPath = adminPath
  if (status) edgeUpdates.siteStatus = status as SiteStatus
  if (Object.keys(edgeUpdates).length > 0) {
    await syncToEdgeConfig(edgeUpdates).catch(() => {})
    invalidateSiteConfigCache()
  }

  // When the media provider changed, return a per-provider breakdown of existing
  // rows so the UI can decide whether to prompt for a migration.
  if (rest.mediaProvider !== undefined && updated.mediaProvider) {
    const grouped = await prisma.media.groupBy({ by: ['provider'], _count: { _all: true } })
    const breakdown: Record<string, number> = {}
    for (const g of grouped) breakdown[g.provider] = g._count._all
    return NextResponse.json({ ok: true, mediaProvider: updated.mediaProvider, breakdown })
  }

  return NextResponse.json({ ok: true })
}
