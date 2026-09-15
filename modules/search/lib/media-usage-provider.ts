import { prisma } from '@/lib/db/prisma'

// Provider for the core.media-usage-providers extension point.
//
// Each indexed document keeps a thumbnail url of its own, copied off the entity
// at index time. Core cannot see this table, so an image the index is serving
// counted as unused - and "unused" is what the media library's bulk-delete
// button acts on.
export async function searchMediaUsageProvider(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ ref: string | null }[]>`
    SELECT "image_url" AS ref FROM "srch_documents" WHERE "image_url" IS NOT NULL
  `
  return rows.map((r) => r.ref).filter((r): r is string => !!r)
}
