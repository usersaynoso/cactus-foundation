import { prisma } from '@/lib/db/prisma'
import { getMediaReferenceDetachers, type MediaReferenceDetach } from '@/lib/media/reference-detachers'

// Take every reference to an item off it, so deleting the item leaves a site that
// renders rather than a site full of holes.
//
// The counterpart to rewriteMediaReferencesInContent in lib/media/upload.ts. That
// one runs when a blob MOVES and has a new address to send every reference to;
// this one runs when it goes away and has nowhere to send them, so the only
// honest thing to do is make each reference absent - drop the gallery row, blank
// the swatch, null the social image - and let each surface fall back to whatever
// it draws with no picture at all.
//
// Core's own dangling ids are part of the same job: SiteConfig keeps its logo and
// icons as plain id columns with no foreign key behind them, and a page's social
// image and a member's avatar the same way, so nothing in the database tidies
// them up. What IS behind a foreign key (an item's tags, a member's data export)
// cascades on its own and is left alone here.

/** The site-config columns that hold nothing but a Media id. */
const SITE_CONFIG_MEDIA_COLUMNS = [
  'logoMediaId',
  'logoDarkMediaId',
  'faviconMediaId',
  'faviconDarkMediaId',
  'appIconMediaId',
  'favicon16MediaId',
  'favicon32MediaId',
  'appleTouchIconMediaId',
  'webManifest192MediaId',
  'webManifest512MediaId',
] as const

type SiteConfigMediaColumn = (typeof SITE_CONFIG_MEDIA_COLUMNS)[number]

/**
 * Detach `media` from everything that points at it, core's tables and every
 * installed module's alike. Does NOT delete the row or the blob - the caller does
 * that, and only once this has returned.
 *
 * Modules go first, deliberately. A detacher is allowed to throw and a throw has
 * to abort the delete (see the contract in lib/media/reference-detachers.ts), so
 * the writes core is certain of are left until nothing else can fail: a module
 * that blows up must not cost the site its logo for a delete that then did not
 * happen.
 *
 * Every detach is idempotent - "make this reference absent" is the same answer
 * however many times it is asked - so a caller that failed part-way through and
 * is tried again finishes the job rather than compounding it.
 */
export async function detachMediaReferences(media: MediaReferenceDetach): Promise<void> {
  for (const detach of await getMediaReferenceDetachers()) {
    await detach(media)
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: Object.fromEntries(SITE_CONFIG_MEDIA_COLUMNS.map((c) => [c, true])) as Record<SiteConfigMediaColumn, true>,
  })
  if (config) {
    const cleared = SITE_CONFIG_MEDIA_COLUMNS.filter((column) => config[column] === media.id)
    if (cleared.length > 0) {
      await prisma.siteConfig.update({
        where: { id: 'singleton' },
        data: Object.fromEntries(cleared.map((column) => [column, null])),
      })
    }
  }

  await prisma.infoPage.updateMany({ where: { ogImageId: media.id }, data: { ogImageId: null } })
  await prisma.member.updateMany({ where: { avatarMediaId: media.id }, data: { avatarMediaId: null } })
}
