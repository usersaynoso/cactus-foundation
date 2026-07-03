import { createHash } from 'crypto'
import { prisma } from '@/lib/db/prisma'
import { getSessionSecret, getActiveMediaProvider, isMediaProviderConfigured } from '@/lib/config/env'
import { getModuleDataExportPaths } from '@/lib/modules/member-extensions'
import { uploadMedia, saveMediaRecord } from '@/lib/media/upload'

const EXPORT_DOWNLOAD_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

// Internal bearer a module's own dataExportPath handler can verify (via
// verifyInternalExportBearer below) to trust this specific self-origin call.
// Derived from SESSION_SECRET rather than a separate secret to manage; never
// sent to a browser, only ever used server-to-server within this deployment.
function internalExportBearer(): string {
  return createHash('sha256').update(`member-export:${getSessionSecret()}`).digest('hex')
}

export function verifyInternalExportBearer(authHeader: string | null): boolean {
  return authHeader === `Bearer ${internalExportBearer()}`
}

// Assembles the full GDPR Art. 20 export: core tables plus each active
// module's contribution (memberExtensions.dataExportPath, called in-process
// over HTTP so core never needs to know a module's internal data shape).
export async function assembleMemberExport(memberId: string): Promise<Record<string, unknown>> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      passkeys: { select: { id: true, credentialId: true, transports: true, deviceName: true, createdAt: true, lastUsedAt: true } },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true, lastActiveAt: true },
      },
      consentRecords: { select: { consentType: true, granted: true, createdAt: true } },
      activityEvents: { orderBy: { createdAt: 'desc' }, take: 200, select: { type: true, source: true, metadata: true, createdAt: true } },
      notificationPrefs: { select: { channel: true, category: true, digestMode: true, enabled: true } },
      profileVisibility: true,
    },
  })
  if (!member) throw new Error('Member not found')

  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
  const modulePaths = await getModuleDataExportPaths()
  const bearer = internalExportBearer()

  const modules: Record<string, unknown> = {}
  for (const { moduleName, path } of modulePaths) {
    try {
      const res = await fetch(`${siteUrl}${path}`, {
        headers: { Authorization: `Bearer ${bearer}`, 'x-cactus-member-id': memberId },
        signal: AbortSignal.timeout(10_000),
      })
      modules[moduleName] = res.ok ? await res.json() : { error: `Export failed: ${res.status}` }
    } catch (err: unknown) {
      modules[moduleName] = { error: err instanceof Error ? err.message : 'Export failed' }
    }
  }

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: member.id,
      email: member.email,
      username: member.username,
      displayName: member.displayName,
      bio: member.bio,
      websiteUrl: member.websiteUrl,
      avatarChoice: member.avatarChoice,
      createdAt: member.createdAt,
    },
    passkeys: member.passkeys,
    activeSessions: member.sessions,
    consentRecords: member.consentRecords,
    activity: member.activityEvents,
    notificationPreferences: member.notificationPrefs,
    profileVisibility: member.profileVisibility,
    modules,
  }
}

// Runs the whole request end-to-end synchronously (assemble -> upload ->
// mark ready), same "process within the request" constraint the Gazette/
// Boards importers already accept on this platform - exports are small JSON,
// not the bulk multi-item imports those handle.
export async function createDataExportRequest(memberId: string) {
  const existing = await prisma.memberDataExportRequest.findFirst({
    where: { memberId, status: { in: ['PENDING', 'PROCESSING'] } },
  })
  if (existing) {
    throw new Error('An export is already in progress')
  }

  const provider = await getActiveMediaProvider()
  if (!provider || !isMediaProviderConfigured(provider)) {
    throw new Error('Data export requires media storage to be configured')
  }

  const request = await prisma.memberDataExportRequest.create({
    data: { memberId, status: 'PROCESSING' },
  })

  try {
    const data = await assembleMemberExport(memberId)
    const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8')
    const uploadResult = await uploadMedia(buffer, 'application/json', provider, `member-export-${memberId}.json`)
    const media = await saveMediaRecord({
      key: uploadResult.key,
      url: uploadResult.url,
      provider,
      mimeType: 'application/json',
      sizeBytes: uploadResult.sizeBytes,
      isDecorative: true,
    })

    return prisma.memberDataExportRequest.update({
      where: { id: request.id },
      data: {
        status: 'READY',
        mediaId: media.id,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + EXPORT_DOWNLOAD_TTL_MS),
      },
    })
  } catch (err) {
    // No FAILED status exists in the schema - delete the stuck row so the
    // member can immediately retry rather than being blocked by the
    // "one active request" guard forever.
    await prisma.memberDataExportRequest.delete({ where: { id: request.id } }).catch(() => {})
    throw err
  }
}

// Cron target: expires any READY export past its 48h download window,
// deleting the underlying media file too.
export async function expireDataExports(): Promise<number> {
  const due = await prisma.memberDataExportRequest.findMany({
    where: { status: 'READY', expiresAt: { lte: new Date() } },
  })
  if (due.length === 0) return 0

  const { deleteMedia } = await import('@/lib/media/upload')
  for (const request of due) {
    if (request.mediaId) {
      const media = await prisma.media.findUnique({ where: { id: request.mediaId } })
      if (media) {
        await deleteMedia(media.provider, media.key).catch(() => {})
        await prisma.media.delete({ where: { id: media.id } }).catch(() => {})
      }
    }
  }
  await prisma.memberDataExportRequest.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { status: 'EXPIRED', mediaId: null },
  })
  return due.length
}
