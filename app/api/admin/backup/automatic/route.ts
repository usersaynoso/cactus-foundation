import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { MediaProviderType } from '@prisma/client'
import { BACKUP_EVERY, type BackupEvery, type BackupStorage, type SiteBackupRequest } from '@/cactus-host/protocol'
import { getSessionFromCookie } from '@/lib/auth/session'
import { isAdmin } from '@/lib/permissions/check'
import { getSiteConfig } from '@/lib/config/site'
import { detectHostingProvider, getHostingCredentials } from '@/lib/hosting/provider'
import { PROVIDER_LABELS } from '@/lib/media/providers'
import { getS3Config } from '@/lib/media/s3-config'
import { getServerBackup, runServerBackup, saveServerBackup } from '@/lib/server-host/backup'
import { ServerHostApiError } from '@/lib/server-host/api'

// Settings > Backup & restore > Automatic backups.
//
// On a site that runs on its own server, cactus-host takes the backups: a real
// pg_dump on the schedule set here, copied to a folder in the site's own bucket and
// tidied after the number of days set here. This route reads and changes those
// settings through cactus-host with the site's own token, and starts a run on request.
//
// Elsewhere (Vercel, Netlify) there is no server of ours to run pg_dump, and building
// the dump inside a function cannot cope with a large database, so the card says so
// and the download stays the way to take a copy.
//
// The bucket is never chosen here: cactus-host opens it with the site's own storage
// key from its env file. The folder is the only thing the admin picks, so a site can
// only ever send its database to its own storage.

/** The storage providers cactus-host can copy into, by their Cactus names. */
const BACKUP_STORAGE: ReadonlySet<MediaProviderType> = new Set<MediaProviderType>(['B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO'])

const Schedule = z.object({
  // z.enum wants a non-empty tuple; BACKUP_EVERY is one, typed as a plain list.
  every: z.enum(BACKUP_EVERY as unknown as [BackupEvery, ...BackupEvery[]]),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  keepDays: z.number().int().min(1).max(3650),
})

const Body = z
  .object({
    folder: z.string().trim().min(1).max(500).optional(),
    schedule: Schedule.optional(),
  })
  .refine((b) => b.folder !== undefined || b.schedule !== undefined, { message: 'Nothing to save' })

type Storage = { provider: MediaProviderType; label: string; bucket: string; supported: boolean }

async function storageInfo(): Promise<Storage | null> {
  const provider = (await getSiteConfig())?.mediaProvider
  if (!provider) return null
  const supported = BACKUP_STORAGE.has(provider)
  let bucket = ''
  if (supported) {
    try {
      bucket = getS3Config(provider).bucket
    } catch {
      bucket = ''
    }
  }
  return { provider, label: PROVIDER_LABELS[provider], bucket, supported }
}

/** The server credential, or a ready-made answer explaining why there is none. */
async function serverOrReason(): Promise<{ token: string; siteId: string } | { reason: string }> {
  if (detectHostingProvider() !== 'server') {
    return { reason: 'Automatic backups are taken by your own server, and this site is not running on one. Download a backup below instead.' }
  }
  const creds = getHostingCredentials()
  if (!creds) return { reason: 'This site cannot reach its server: CACTUS_HOST_TOKEN or CACTUS_HOST_SITE_ID is missing.' }
  return { token: creds.token, siteId: creds.siteId }
}

async function authorise(): Promise<NextResponse | null> {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

function hostFailure(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : 'Your server did not answer.'
  const status = err instanceof ServerHostApiError && err.status >= 400 && err.status < 500 ? 400 : 502
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const refused = await authorise()
  if (refused) return refused
  const storage = await storageInfo()
  const server = await serverOrReason()
  if ('reason' in server) return NextResponse.json({ available: false, reason: server.reason, storage, backup: null })
  try {
    return NextResponse.json({ available: true, reason: null, storage, backup: await getServerBackup(server.token, server.siteId) })
  } catch (err: unknown) {
    // A server whose cactus-host predates automatic backups answers 404 here.
    if (err instanceof ServerHostApiError && err.status === 404) {
      return NextResponse.json({
        available: false,
        reason: 'Your server needs a newer cactus-host before it can take automatic backups. Whoever runs the server can update it.',
        storage,
        backup: null,
      })
    }
    return hostFailure(err)
  }
}

export async function PUT(request: NextRequest) {
  const refused = await authorise()
  if (refused) return refused
  const server = await serverOrReason()
  if ('reason' in server) return NextResponse.json({ error: server.reason }, { status: 409 })

  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })

  const body: SiteBackupRequest = {}
  if (parsed.data.schedule) body.schedule = parsed.data.schedule
  if (parsed.data.folder !== undefined) {
    const storage = await storageInfo()
    if (!storage?.supported) {
      return NextResponse.json({ error: 'Backups can be copied to Backblaze B2, Cloudflare R2, Amazon S3, DigitalOcean Spaces, Wasabi or MinIO storage. Connect one under Settings > Media first.' }, { status: 409 })
    }
    body.storage = storage.provider as BackupStorage
    body.folder = parsed.data.folder
  }

  try {
    return NextResponse.json({ backup: await saveServerBackup(server.token, server.siteId, body) })
  } catch (err: unknown) {
    return hostFailure(err)
  }
}

export async function POST() {
  const refused = await authorise()
  if (refused) return refused
  const server = await serverOrReason()
  if ('reason' in server) return NextResponse.json({ error: server.reason }, { status: 409 })
  try {
    return NextResponse.json(await runServerBackup(server.token, server.siteId))
  } catch (err: unknown) {
    return hostFailure(err)
  }
}
