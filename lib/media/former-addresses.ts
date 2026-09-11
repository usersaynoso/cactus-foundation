import { prisma } from '@/lib/db/prisma'

// A media item keeps its identity through an optimise, a resize, a crop, a
// replace, a rename, a move or a dedupe - but not its address. Core rewrites
// every reference it can reach at the moment of the move (Puck builder JSON, plus
// whatever the installed modules repoint through core.media-reference-rewriters),
// and that covers every reference that exists at that moment.
//
// It cannot cover a reference written afterwards against a url captured before:
// an editor screen opened at nine, an optimise run at ten past, the screen saved
// at quarter past with the urls it has been holding all along. Nothing rewrites
// that, because nothing was there to rewrite.
//
// So the old address is kept. Two things then work that could not before:
//
//  1. A stale reference still counts as a reference, so the item never reads as
//     "unused" and is never offered up for bulk deletion. That is the failure this
//     exists for: a product's photography optimised while its editor was open,
//     saved with the pre-optimise urls, and binned as spare an hour later.
//  2. A module about to store a media url can ask what that url resolves to now
//     and store the live one instead, so the picture does not 404 in the meantime.

/** What moved the blob. Display only - nothing branches on it. */
export type MediaMoveReason = 'optimise' | 'resize' | 'crop' | 'replace' | 'rename' | 'move' | 'dedupe'

/**
 * Record that `mediaId` used to answer to `url`/`key`.
 *
 * A no-op when neither actually changed, so callers can hand over both pairs
 * without checking first. Never throws: this is a safety net, and failing an
 * optimise because its audit trail could not be written would be the net doing
 * more harm than the thing it catches.
 */
export async function recordFormerMediaAddress(
  mediaId: string,
  url: string,
  key: string,
  reason: MediaMoveReason,
): Promise<void> {
  if (!url && !key) return
  try {
    await prisma.mediaFormerAddress.create({ data: { mediaId, url, key, reason } })
  } catch (err) {
    console.error(`[media] could not record former address for ${mediaId}:`, err)
  }
}

/**
 * Where each of `urls` points now.
 *
 * A url that is still a live `Media.url` maps to itself. One that is only a
 * former address maps to the current url of the item that used to live there. One
 * that names nothing at all is absent from the map - the caller keeps what it was
 * given rather than being handed a guess.
 *
 * Call this on the way INTO a module's own table, so the column starts out
 * holding an address that resolves. It is deliberately not automatic: core cannot
 * see a module's tables, and a module that stores urls is the only thing that
 * knows when it is about to.
 */
export async function resolveCurrentMediaUrls(urls: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(urls.filter(Boolean))]
  const resolved = new Map<string, string>()
  if (wanted.length === 0) return resolved

  const live = await prisma.media.findMany({
    where: { url: { in: wanted } },
    select: { url: true },
  })
  for (const m of live) resolved.set(m.url, m.url)

  const stale = wanted.filter((u) => !resolved.has(u))
  if (stale.length === 0) return resolved

  const former = await prisma.mediaFormerAddress.findMany({
    where: { url: { in: stale } },
    // Oldest first, so the newest address of a twice-moved item wins the
    // last write into the map below.
    orderBy: { createdAt: 'asc' },
    select: { url: true, media: { select: { url: true } } },
  })
  for (const f of former) resolved.set(f.url, f.media.url)

  return resolved
}

/** `urls`, each swapped for where it points now; unknown ones left alone. */
export async function repointToCurrentMediaUrls(urls: string[]): Promise<string[]> {
  const resolved = await resolveCurrentMediaUrls(urls)
  return urls.map((u) => resolved.get(u) ?? u)
}
