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
   * True when at least one module's usage provider failed, so the index is known
   * to be incomplete. Everything is then treated as in use: an over-cautious
   * "nothing to reclaim" is a wasted click, whereas an under-cautious "unused"
   * is a bulk-delete button aimed at live product photography.
   */
  degraded: boolean
}

// Wrapped in React's `cache` so the index is built at most once per request. The
// media page alone used to build it twice (library query + stats), and it is the
// single most expensive read in the admin: every page and layout's builder JSON.
// The cache is per-request, so a later request always sees fresh content.
/** Load the usage index once, then classify many Media rows against it. */
export const loadMediaUsageIndex = cache(async (): Promise<MediaUsageIndex> => {
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

  return { referencedIds, haystack, degraded }
})

/** Is a single Media row referenced anywhere on the site? */
export function isMediaInUse(
  media: { id: string; key: string; url: string },
  index: MediaUsageIndex,
): boolean {
  if (index.degraded) return true
  if (index.referencedIds.has(media.id)) return true
  // Puck blocks embed media by url (bgImage/imageUrl/mediaUrl), by storage key,
  // or by id (ImageBlock/Card mediaId). Any occurrence means it is in use.
  const { haystack } = index
  if (media.url && haystack.includes(media.url.toLowerCase())) return true
  if (media.key && haystack.includes(media.key.toLowerCase())) return true
  if (haystack.includes(media.id.toLowerCase())) return true
  return false
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
