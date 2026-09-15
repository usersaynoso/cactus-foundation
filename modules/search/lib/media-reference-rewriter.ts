import { prisma } from '@/lib/db/prisma'
import type { MediaReferenceChange } from '@/lib/media/reference-rewriters'

// Provider for the core.media-reference-rewriters extension point.
//
// The search index stores each document's thumbnail as a url copied off the
// product at index time, so a blob that moves leaves every result card pointing
// at a dead file until the next full re-index - which may be days, and is not
// something a visitor's broken picture waits politely for. Repoint it now.
export async function searchMediaReferenceRewriter(change: MediaReferenceChange): Promise<void> {
  const { oldUrl, newUrl } = change
  if (!oldUrl || oldUrl === newUrl) return

  await prisma.$executeRaw`
    UPDATE "srch_documents" SET "image_url" = ${newUrl} WHERE "image_url" = ${oldUrl}
  `
}
