import { cache } from 'react'
import { prisma } from '@/lib/db/prisma'
import { getMediaUsageProviders } from '@/lib/media/usage-providers'

// A Media row can be referenced two different ways across the site:
//
//  1. By id, held in a foreign-key column — site branding (logo/favicon, light
//     and dark), a page's social-share image, member avatars, and the temporary
//     zip attached to a data-export request.
//  2. By url or id embedded inside Puck builder JSON — background images, card
//     thumbnails, image blocks, etc. These live inside InfoPage.builderData /
//     publishedData and Layout.builderData rather than in a real relation.
//  3. By url, key or id held in a MODULE's own tables — a shop product image, an
//     option or attribute swatch, a 3D model, a board icon, a gazette hero. Core
//     cannot see any of it, so each module contributes its own references through
//     the core.media-usage-providers extension point.
//
// Deciding "is this item in use?" therefore needs both a set of referenced ids
// and a scan of every builder blob. `loadMediaUsageIndex` gathers both once so a
// whole library can be classified without a query per item.

/** Everything needed to decide whether a Media row is referenced anywhere. */
export type MediaUsageIndex = {
  /** Media.id values held in foreign-key columns. */
  referencedIds: Set<string>
  /**
   * Lowercased concatenation of every Puck builder blob (pages + layouts) plus
   * every reference string the installed modules contributed.
   */
  haystack: string
  /**
   * Every url, storage key and id-shaped token found in `haystack`, pulled out
   * once so a row can be classified with a set lookup instead of a substring
   * scan of the whole blob.
   *
   * Three `haystack.includes()` calls per row is fine on a library of hundreds
   * and quadratic on one of tens of thousands: 36,000 rows against a haystack
   * carrying every product url, 3D model url and swatch on the site is billions
   * of character comparisons, which is why the media page's stat bar stopped
   * arriving at all. Same verdicts, one pass to build.
   */
  referenced: Set<string>
  /**
   * True when at least one module's usage provider failed, so the index is known
   * to be incomplete. Everything is then treated as in use: an over-cautious
   * "nothing to reclaim" is a wasted click, whereas an under-cautious "unused"
   * is a bulk-delete button aimed at live product photography.
   */
  degraded: boolean
}

// Cross-request cache on top of the per-request one below: rebuilding this scans
// every page's and every layout's whole builder JSON, so a media library visited
// repeatedly within the TTL reuses the last scan instead of paying for it again.
// A page saved moments ago briefly reads as "not yet referenced" here - the safe
// direction already established above (isMediaInUse defaults to "in use" on any
// doubt), so a short-lived stale index costs nothing worse than a wasted click.
let cachedIndex: MediaUsageIndex | null = null
let cachedIndexAt = 0
const CACHE_TTL_MS = 30_000

/**
 * Trim a captured url or key to the form a Media row actually holds: no query,
 * no fragment, no trailing sentence punctuation.
 */
function normaliseReference(raw: string): string {
  return raw.replace(/[?#].*$/, '').replace(/[.,;:]+$/, '')
}

/**
 * Every reference-shaped token in `haystack`, lower-cased (the haystack already
 * is). Three shapes, because a media item is referenced by any of the three:
 * a full url, a bare storage key, or a Media id.
 *
 * The character class each url/key match stops at - whitespace, quote, escape,
 * bracket, comma, pipe, angle - is the set that terminates one inside JSON,
 * markdown and HTML alike. A storage key is sanitised down to [a-z0-9._-] and
 * slashes before it is ever written, so none of those characters can appear
 * INSIDE a key: extraction is exact for the shapes this site stores, not a
 * heuristic. Percent-encoded forms are recorded decoded as well, since builder
 * JSON sometimes carries the encoded spelling of a key the row holds plainly.
 */
export function extractReferenceTokens(haystack: string): Set<string> {
  const out = new Set<string>()
  const add = (raw: string) => {
    const value = normaliseReference(raw)
    if (!value) return
    out.add(value)
    try {
      const decoded = decodeURIComponent(value)
      if (decoded !== value) out.add(decoded)
    } catch {
      // A stray % makes this throw; the raw form is already recorded.
    }
  }
  for (const m of haystack.matchAll(/https?:\/\/[^\s"'\\)>,\]}|]+/g)) add(m[0])
  for (const m of haystack.matchAll(/media\/[^\s"'\\)>,\]}|]+/g)) add(m[0])
  // Ids are opaque alphanumeric handles (cuid, or the shorter minted ones), and
  // turn up quoted in builder JSON as "mediaId":"...". Over-matching here is
  // harmless: a token nothing owns simply never gets looked up.
  for (const m of haystack.matchAll(/[a-z0-9]{20,40}/g)) out.add(m[0])
  return out
}

/**
 * Can `value` be trusted to the token set? True when every character in it is
 * one a key or url is allowed to contain, which is the assumption extraction
 * rests on. Anything stranger - a legacy row written before keys were sanitised,
 * a url with a space in it - falls back to the old substring scan rather than
 * being quietly declared unused, because "unused" is the verdict that arms a
 * bulk-delete button.
 */
function isPlainReference(value: string): boolean {
  return /^[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/i.test(value)
}

async function buildMediaUsageIndex(): Promise<MediaUsageIndex> {
  const [config, ogPages, avatars, exports, pages, layouts] = await Promise.all([
    prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        logoMediaId: true,
        logoDarkMediaId: true,
        faviconMediaId: true,
        faviconDarkMediaId: true,
        appIconMediaId: true,
        appleTouchIconMediaId: true,
        webManifest192MediaId: true,
        webManifest512MediaId: true,
      },
    }),
    prisma.infoPage.findMany({ where: { ogImageId: { not: null } }, select: { ogImageId: true } }),
    prisma.member.findMany({ where: { avatarMediaId: { not: null } }, select: { avatarMediaId: true } }),
    prisma.memberDataExportRequest.findMany({ where: { mediaId: { not: null } }, select: { mediaId: true } }),
    prisma.infoPage.findMany({ select: { builderData: true, publishedData: true } }),
    prisma.layout.findMany({ select: { builderData: true } }),
  ])

  const referencedIds = new Set<string>()
  for (const id of [
    config?.logoMediaId,
    config?.logoDarkMediaId,
    config?.faviconMediaId,
    config?.faviconDarkMediaId,
    config?.appIconMediaId,
    config?.appleTouchIconMediaId,
    config?.webManifest192MediaId,
    config?.webManifest512MediaId,
  ]) {
    if (id) referencedIds.add(id)
  }
  for (const p of ogPages) if (p.ogImageId) referencedIds.add(p.ogImageId)
  for (const m of avatars) if (m.avatarMediaId) referencedIds.add(m.avatarMediaId)
  for (const e of exports) if (e.mediaId) referencedIds.add(e.mediaId)

  const parts: string[] = []
  for (const p of pages) {
    if (p.builderData) parts.push(JSON.stringify(p.builderData))
    if (p.publishedData) parts.push(JSON.stringify(p.publishedData))
  }
  for (const l of layouts) if (l.builderData) parts.push(JSON.stringify(l.builderData))

  // Modules run in parallel with each other, and one failing must not take the
  // media page down with it — but it must not quietly pass off half an index as
  // the whole truth either, so the failure is recorded and the caller stops
  // trusting the "unused" verdict.
  let degraded = false
  const contributed = await Promise.all(
    getMediaUsageProviders().map(async (provider) => {
      try {
        return await provider()
      } catch (err) {
        degraded = true
        console.error('[media] usage provider failed; treating library as fully in use', err)
        return []
      }
    }),
  )
  for (const refs of contributed) {
    for (const ref of refs) if (ref) parts.push(ref)
  }

  const haystack = parts.join('\n').toLowerCase()

  return { referencedIds, haystack, referenced: extractReferenceTokens(haystack), degraded }
}

// Wrapped in React's `cache` so a single request never builds the index twice
// (the media page alone used to: library query + stats). The TTL cache above
// this covers every request after the first within its window.
/** Load the usage index once, then classify many Media rows against it. */
export const loadMediaUsageIndex = cache(async (): Promise<MediaUsageIndex> => {
  const now = Date.now()
  if (cachedIndex && now - cachedIndexAt < CACHE_TTL_MS) return cachedIndex
  const index = await buildMediaUsageIndex()
  cachedIndex = index
  cachedIndexAt = now
  return index
})

/**
 * Is this row's url, key or id embedded in page, layout or module content?
 * The content half of the usage question, split out because the media library's
 * "what references this?" warning names that source separately from the
 * foreign-key ones.
 */
export function isMediaInContent(
  media: { id: string; key: string; url: string },
  index: MediaUsageIndex,
): boolean {
  const { haystack, referenced } = index
  const url = media.url ? media.url.toLowerCase() : ''
  const key = media.key ? media.key.toLowerCase() : ''

  if (url && referenced.has(url)) return true
  if (key && referenced.has(key)) return true
  if (referenced.has(media.id.toLowerCase())) return true

  // Nothing matched. For the ordinary shapes that is the answer - extraction is
  // exact for them - but a value carrying a character extraction cannot have
  // captured gets the original substring scan, so an odd row can never be
  // mislabelled unused. Only unmatched rows ever pay for this.
  if (url && !isPlainReference(url) && haystack.includes(url)) return true
  if (key && !isPlainReference(key) && haystack.includes(key)) return true
  return false
}

/** Is a single Media row referenced anywhere on the site? */
export function isMediaInUse(
  media: { id: string; key: string; url: string },
  index: MediaUsageIndex,
): boolean {
  if (index.degraded) return true
  if (index.referencedIds.has(media.id)) return true
  // Puck blocks embed media by url (bgImage/imageUrl/mediaUrl), by storage key,
  // or by id (ImageBlock/Card mediaId). Any occurrence means it is in use.
  return isMediaInContent(media, index)
}

/** Ids of every Media row in `media` that is referenced somewhere on the site. */
export async function getInUseMediaIds(
  media: Array<{ id: string; key: string; url: string }>,
): Promise<Set<string>> {
  const index = await loadMediaUsageIndex()
  const inUse = new Set<string>()
  for (const m of media) if (isMediaInUse(m, index)) inUse.add(m.id)
  return inUse
}
