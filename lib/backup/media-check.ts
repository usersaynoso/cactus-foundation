import type { MediaProviderType } from '@prisma/client'
import { isMediaProviderConfigured } from '@/lib/config/env'
import { PROVIDER_LABELS } from '@/lib/media/providers'

// A database backup carries the Media *catalogue* - keys, URLs, alt text, folders,
// tags, which provider each item lives on - but NOT the file bytes. Those sit in an
// external storage bucket (Backblaze, R2, Cloudinary, ...) that no SQL dump ever
// touches (see lib/backup/dump.ts). Restoring the database therefore brings the rows
// back; whether the *files* come back depends entirely on the restored site pointing
// at the same bucket.
//
// A same-site rollback keeps its bucket, so nothing is wrong. A restore onto a fresh
// install whose storage isn't the source's bucket leaves every image pointing at
// objects this site cannot serve - broken pictures the owner discovers later, not now.
//
// This runs after a restore and tells the owner, in plain English, when that has
// happened. It does NOT fetch the media URLs to check them: those URLs come from an
// uploaded backup file, so having the server request them would be a server-side
// request forgery (SSRF) vector - especially on the pre-auth setup import route.
// Instead it asks a question that needs no network and no attacker-controlled input:
// does this install even hold credentials for the providers the restored media uses?
// If not, those files will 404, and that is worth saying out loud.
//
// Deliberately conservative - it warns ONLY when a provider used by restored media has
// no credentials here. It cannot catch "right provider, wrong bucket" (the credentials
// look fine); that gap closes with the planned media-inclusive backup, and until then
// the backup docs spell out that the storage bucket must travel with the database.

/** The slice of PrismaClient this needs - restore passes the app's client. */
export type MediaCheckDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

export async function checkRestoredMediaStorage(db: MediaCheckDb): Promise<string[]> {
  // The Media table is core, so it always exists on a restore target.
  const rows = await db.$queryRawUnsafe<{ provider: MediaProviderType | null; count: bigint }[]>(
    `SELECT "provider", count(*)::bigint AS count FROM "Media" GROUP BY "provider"`,
  )

  const warnings: string[] = []
  for (const row of rows) {
    const n = Number(row.count)
    if (n === 0 || !row.provider) continue
    if (isMediaProviderConfigured(row.provider)) continue

    const label = PROVIDER_LABELS[row.provider] ?? row.provider
    warnings.push(
      n > 1
        ? `${n} media files are stored on ${label}, which this site isn't connected to. ` +
            `Reconnect that storage (or migrate your media across) or they'll show as broken.`
        : `1 media file is stored on ${label}, which this site isn't connected to. ` +
            `Reconnect that storage (or migrate your media across) or it'll show as broken.`,
    )
  }
  return warnings
}
