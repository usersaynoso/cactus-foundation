import { prisma } from '@/lib/db/prisma'
import { takeOverMediaReferences } from '@/lib/media/organise'
import { deleteMedia } from '@/lib/media/upload'
import { KNOWN_RENDITION_SPECS } from '@/lib/media/rendition-naming'

// Collapsing duplicate shrunk copies onto one file.
//
// A rendition is identified by its NAME within its folder - "<original key>-thumb
// .webp" and nothing else - so two rows of that name in one folder are two files
// serving one picture. On the catalogue this was written for there were 1,392
// such groups, about 2,900 rows, every one made in a single day before the
// reuse check landed: several callers asked for the small copy of the same
// picture at once, each looked, each found nothing on file, and each wrote one.
// "Is it there?" and "write it" have no lock between them.
//
// The extra rows are not merely untidy. Every lookup resolves to the oldest of
// them, so the others are files nothing will ever serve, and a sweep that moved
// them into `thumb` folders would carry the clutter across rather than clear it.
//
// WHICH ONE SURVIVES IS NOT A FREE CHOICE. Every lookup in renditions.ts orders
// by `createdAt` ascending and takes the first, so the OLDEST row is the one the
// site is already drawing. Keep that one and nothing on any page changes; keep a
// different one and every reference has to be rewritten to match. So: oldest
// wins, which makes this a deletion of files nothing points at rather than a
// substitution.
//
// Even so, the losers' references are handed over before anything is deleted -
// a url captured before an earlier move, a hand-edited page, a module column
// written while a duplicate happened to be the newest row. takeOverMediaReferences
// repoints Puck content, the modules' own tables and the id-keyed fields, and
// records the loser's address as a former address of the survivor, so a url that
// named a duplicate still resolves afterwards.

export type RenditionDedupeProgress = {
  /** Duplicate groups looked at. */
  groups: number
  /** Rows deleted (the losers). */
  deleted: number
  /** Blobs removed from the provider. */
  blobsDeleted: number
  /** Rows left alone because deleting them was not obviously safe. */
  kept: number
}

export type RenditionDedupeResult = RenditionDedupeProgress & { more: boolean }

// A rendition name, optionally carrying the " (1)" / " (2)" tail that a
// collision-avoiding writer appends when the name it wanted was already taken.
//
// Matching only the plain form was a real miss: it left 11,429 copies untouched
// on the catalogue this was written for - 10,691 of them "(1)" and 738 "(2)" -
// and reported "0 duplicates remaining", which was true only inside the pattern
// it happened to look at. Every one of those had a plain sibling in the same
// folder, so every one was a second file serving a picture that already had one.
const RENDITION_NAME_RE = KNOWN_RENDITION_SPECS.map((spec) => spec.suffix).join('|')

/** SQL regex for any rendition name, with or without a " (n)" tail. */
function renditionNameRegex(): string {
  return `-(${RENDITION_NAME_RE})( \\(\\d+\\))?\\.webp$`
}

/** How many duplicate rows are outstanding - the number this is working through. */
export async function countDuplicateRenditions(): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(sum(c - 1), 0) AS n FROM (
      SELECT count(*) AS c FROM "Media"
      WHERE "mimeType" = 'image/webp' AND "originalName" ~ ${renditionNameRegex()}
      GROUP BY "folderId", regexp_replace("originalName", ' \\(\\d+\\)\\.webp$', '.webp')
      HAVING count(*) > 1
    ) d
  `
  return Number(rows[0]?.n ?? 0)
}

/**
 * Collapse up to `limit` duplicate groups onto their oldest member.
 *
 * Not resumable by cursor and deliberately so: each pass asks which groups are
 * still duplicated, so finishing a group removes it from the next pass's view.
 * Run it until it reports nothing left.
 *
 * `dryRun` reports what would go and deletes nothing.
 */
export async function dedupeRenditions(opts?: {
  limit?: number
  dryRun?: boolean
  /** Which slice of the duplicate groups to take: 0 <= shard < shards. */
  shard?: number
  shards?: number
  onProgress?: (p: RenditionDedupeProgress) => void
}): Promise<RenditionDedupeResult> {
  const limit = opts?.limit ?? 100
  const dryRun = opts?.dryRun ?? false
  const shards = Math.max(1, opts?.shards ?? 1)
  const shard = Math.min(Math.max(0, opts?.shard ?? 0), shards - 1)

  // Sharded on a HASH of the group's identity rather than on a row offset.
  //
  // Each group is a self-contained unit of work - one survivor, its losers - so
  // workers need never coordinate, but they must never be handed the SAME group:
  // two workers collapsing one group both delete the same losers and the slower
  // one fails on rows that are already gone. A hash of (folder, name) is stable,
  // needs no cursor, and cannot drift as rows disappear underneath it, which an
  // OFFSET-based split would do on every pass.
  const groups = await prisma.$queryRaw<{ folderId: string | null; originalName: string }[]>`
    SELECT "folderId",
           regexp_replace("originalName", ' \\(\\d+\\)\\.webp$', '.webp') AS "originalName"
    FROM "Media"
    WHERE "mimeType" = 'image/webp' AND "originalName" ~ ${renditionNameRegex()}
      AND mod(abs(hashtext(coalesce("folderId", '') ||
            regexp_replace("originalName", ' \\(\\d+\\)\\.webp$', '.webp'))), ${shards}) = ${shard}
    GROUP BY 1, 2
    HAVING count(*) > 1
    LIMIT ${limit + 1}
  `
  const more = groups.length > limit
  const batch = groups.slice(0, limit)

  const progress: RenditionDedupeProgress = { groups: 0, deleted: 0, blobsDeleted: 0, kept: 0 }

  for (const group of batch) {
    progress.groups += 1
    // Every row in the group: the plainly-named one and any " (n)" siblings.
    //
    // Ordered so the survivor is the row a LOOKUP will actually resolve to.
    // Every lookup in renditions.ts matches `originalName` against the name
    // derived from the original's key - the plain form, with no " (n)" - and
    // then takes the oldest. So the plain name wins first and age only settles
    // ties. Keeping a " (1)" row because it happened to be older would leave the
    // group with nothing a lookup can find, and every one of those pictures
    // would silently fall back to drawing its full-size original.
    const ordered = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Media"
      WHERE "mimeType" = 'image/webp'
        AND "folderId" IS NOT DISTINCT FROM ${group.folderId}
        AND regexp_replace("originalName", ' \\(\\d+\\)\\.webp$', '.webp') = ${group.originalName}
      ORDER BY ("originalName" = ${group.originalName}) DESC, "createdAt" ASC
    `
    if (ordered.length < 2) continue

    // Full rows, because handing references over needs the whole item. Re-sorted
    // into the order the statement above decided, which findMany does not keep.
    const byId = new Map(
      (await prisma.media.findMany({ where: { id: { in: ordered.map((o) => o.id) } } })).map((m) => [m.id, m]),
    )
    const rows = ordered.map((o) => byId.get(o.id)).filter((m): m is NonNullable<typeof m> => !!m)
    if (rows.length < 2) continue

    const [keeper, ...losers] = rows
    if (!keeper) continue

    for (const loser of losers) {
      if (dryRun) {
        progress.deleted += 1
        continue
      }
      try {
        // References first, always. A url that named the duplicate resolves to the
        // survivor afterwards, so nothing is left pointing at a row about to go.
        await takeOverMediaReferences(loser, keeper)

        // The row before the blob. An orphaned blob costs pennies and can be
        // swept later; a live row whose blob has gone is a broken picture.
        await prisma.media.delete({ where: { id: loser.id } })
        progress.deleted += 1

        // Never delete bytes another live row still answers with. Two rows
        // sharing one key is not supposed to happen, and is exactly the case
        // where deleting "the duplicate" takes the survivor's picture with it.
        const sharesKey = await prisma.media.count({ where: { key: loser.key } })
        if (sharesKey > 0) {
          progress.kept += 1
          continue
        }
        await deleteMedia(loser.provider, loser.key)
        progress.blobsDeleted += 1
      } catch (err) {
        // One group failing must not end the pass: the rows stay, still serving,
        // and the next run tries again.
        console.warn(`[media] could not collapse duplicate ${loser.id} onto ${keeper.id}:`, err)
        progress.kept += 1
      }
      opts?.onProgress?.({ ...progress })
    }
  }

  return { ...progress, more }
}
