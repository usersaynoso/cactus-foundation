import { prisma } from '@/lib/db/prisma'

// The SiteConfig columns that hold a favicon / app icon. Logos are deliberately
// not here: a logo is an ordinary picture and is welcome to be WebP.
export const SITE_ICON_COLUMNS = [
  'faviconMediaId',
  'faviconDarkMediaId',
  'appIconMediaId',
  'favicon16MediaId',
  'favicon32MediaId',
  'appleTouchIconMediaId',
  'webManifest192MediaId',
  'webManifest512MediaId',
] as const

export type SiteIconColumn = (typeof SITE_ICON_COLUMNS)[number]

/**
 * The media ids currently in use as site icons. These are never re-encoded by
 * the optimiser: the icon set is exact-size PNGs (and the admin's source image,
 * which every regeneration starts from), and turning them into WebP is what
 * gave Safari blank tabs. Empty on a failed read - the caller is the optimiser,
 * and "could not check" must not turn into "optimise it anyway", so callers
 * treat a throw as a reason to stop, not to carry on.
 */
export async function siteIconMediaIds(): Promise<Set<string>> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: Object.fromEntries(SITE_ICON_COLUMNS.map((c) => [c, true])) as Record<SiteIconColumn, true>,
  })
  const ids = new Set<string>()
  if (!config) return ids
  for (const column of SITE_ICON_COLUMNS) {
    const id = config[column]
    if (id) ids.add(id)
  }
  return ids
}
