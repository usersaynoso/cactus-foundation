import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import type { PuckRenderMetadata } from '@/lib/puck/renderMetadata'
import type { ImageDimensions } from '@/lib/puck/imgDimensions'

// The server half of lib/puck/imgDimensions.ts: which pictures a render is about
// to draw, and the size the media library recorded for each.
//
// RSC-only (prisma). Blocks cannot look anything up for themselves - config.core
// is shared with the client editor - so the sizes are resolved once per render and
// handed down through Puck's metadata, the same door lazyImages and imageResizing
// already come through.
//
// Cost: nothing at all for a render with no image blocks in it, which is most of
// them. Otherwise one indexed query (Media_url_idx) for every picture in the
// render together, and React's cache() means a second render asking about the same
// set in the same request does not ask again.

/**
 * The blocks whose picture is drawn `width: 100%; height: auto` from a `mediaUrl`,
 * which is exactly the shape that shifts the page when the file lands. A block that
 * draws its picture at a fixed height (a Card, a Hero's cover) has nothing to gain.
 */
const DIMENSIONED_BLOCK_TYPES: ReadonlySet<string> = new Set(['ImageBlock', 'ImageChipPanel'])

// A page is a few dozen blocks. The cap is only there so a pathological blob
// cannot turn into a query with thousands of parameters.
const MAX_LOOKUPS = 200

// Longer than any real media address, short enough to refuse a prop that is not one.
const MAX_URL_LENGTH = 2048

/**
 * Every `mediaUrl` a dimensioned block in these Puck data trees will draw. Walks the
 * whole tree rather than `content` alone, because blocks nest in zones and slots,
 * and a layout's data is a tree of the same shape. Order is first-seen, duplicates
 * dropped.
 */
export function collectDimensionedImageUrls(trees: readonly unknown[]): string[] {
  const urls = new Set<string>()
  const stack: unknown[] = [...trees]
  while (stack.length > 0 && urls.size < MAX_LOOKUPS) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i])
      continue
    }
    if (!node || typeof node !== 'object') continue
    const record = node as Record<string, unknown>
    if (typeof record.type === 'string' && DIMENSIONED_BLOCK_TYPES.has(record.type)) {
      const props = record.props
      const url = props && typeof props === 'object' ? (props as Record<string, unknown>).mediaUrl : undefined
      if (typeof url === 'string' && url.length > 0 && url.length <= MAX_URL_LENGTH) urls.add(url)
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }
  return [...urls]
}

/**
 * Recorded sizes for a set of media urls, keyed by url. The argument is the urls
 * joined by newlines so React's cache() - which compares arguments by identity -
 * can recognise the same set asked for twice in one request.
 */
const lookUpMediaDimensions = cache(async (joinedUrls: string): Promise<Record<string, ImageDimensions>> => {
  const urls = joinedUrls.split('\n')
  const rows = await prisma.media.findMany({
    where: { url: { in: urls } },
    select: { url: true, width: true, height: true },
  })
  const out: Record<string, ImageDimensions> = {}
  for (const row of rows) {
    // Two rows may name one url (see 027_media_url_index.sql). The first with a
    // size wins; one without a size - an SVG, a video, a row measured before
    // dimensions were recorded - contributes nothing.
    if (out[row.url] || !row.width || !row.height) continue
    out[row.url] = { width: row.width, height: row.height }
  }
  return out
})

/**
 * The render metadata, plus the recorded size of every picture an image block in
 * these trees draws. Best-effort: a failed lookup renders the page exactly as it
 * did before this existed, without reserved space, rather than failing it.
 */
export async function withMediaDimensions(
  metadata: PuckRenderMetadata | Promise<PuckRenderMetadata>,
  trees: readonly unknown[],
): Promise<PuckRenderMetadata> {
  const urls = collectDimensionedImageUrls(trees)
  if (urls.length === 0) return metadata
  const [base, mediaDimensions] = await Promise.all([
    metadata,
    lookUpMediaDimensions(urls.join('\n')).catch((err: unknown) => {
      console.warn('[puck] could not look up image sizes, rendering without reserved space:', err)
      return null
    }),
  ])
  if (!mediaDimensions || Object.keys(mediaDimensions).length === 0) return base
  return { ...base, mediaDimensions }
}
