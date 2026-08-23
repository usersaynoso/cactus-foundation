import { prisma } from '@/lib/db/prisma'
import { moduleAutoPlaceBlocks } from '@/lib/layout/module-layout-types'

// ---------------------------------------------------------------------------
// Auto-placed blocks.
//
// Some module blocks draw nothing. They are placement markers - "run the thing
// this module does on every page that uses this layout" - and a site owner who
// has installed the module, filled in its settings and switched it on has
// already said everything they mean to say. Making them then find the Layouts
// screen and drop an invisible block into their header is a step that exists
// only because the machinery needs it, and its failure mode is silence: the
// module reports itself installed, active and configured, and does nothing at
// all. That is exactly how a Google tag can be set up correctly and still not
// be found on the site.
//
// So a module may declare `autoPlaceBlocks` in its manifest, and core puts the
// block on the matching layouts for it.
//
// TWO RULES, both load-bearing:
//
//   1. FIRST INSTALL ONLY. Placement runs once, from the same post-deploy hook
//      and behind the same `layoutsSeededAt` stamp that seeds a module's
//      starter layouts. An owner who deliberately deletes the block must never
//      find it back in their header after the next update - that is somebody
//      else editing their site, and no amount of good intention makes it not
//      that.
//   2. NEVER TWICE IN ONE LAYOUT. Presence is judged over the whole document,
//      zones included, so a block the owner moved somewhere sensible is left
//      exactly where they put it rather than joined by a second copy.
// ---------------------------------------------------------------------------

export type AutoPlaceEntry = {
  type: string
  layoutType: string
  position?: 'start' | 'end'
}

type PuckItem = { type?: string; props?: Record<string, unknown> }
type PuckData = { content?: PuckItem[]; root?: unknown; zones?: Record<string, PuckItem[]> }

/** Whether this document already carries the block, anywhere in it. */
export function containsBlock(data: unknown, blockType: string): boolean {
  if (!data || typeof data !== 'object') return false
  const doc = data as PuckData
  if ((doc.content ?? []).some((item) => item?.type === blockType)) return true
  for (const items of Object.values(doc.zones ?? {})) {
    if ((items ?? []).some((item) => item?.type === blockType)) return true
  }
  return false
}

/**
 * The document with the block added, or null when nothing should change -
 * already there, or not a layout document this can safely reason about.
 *
 * Pure, and separately tested: this edits the thing a site's header is made of,
 * and a wrong answer here is a broken header on every page at once.
 */
export function withBlockPlaced(
  data: unknown,
  blockType: string,
  props: Record<string, unknown>,
  position: 'start' | 'end' = 'end'
): PuckData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const doc = data as PuckData
  // A document with no content array is not one this understands. Inventing the
  // array would be a guess about somebody's live layout.
  if (!Array.isArray(doc.content)) return null
  if (containsBlock(doc, blockType)) return null
  const item: PuckItem = { type: blockType, props }
  return {
    ...doc,
    content: position === 'start' ? [item, ...doc.content] : [...doc.content, item],
  }
}

/** A stable, readable id, in the spirit of the ids the starter layouts use. */
function blockId(blockType: string): string {
  return `${blockType.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}-auto`
}

/**
 * Place every block this module declares onto the layouts it names. Returns how
 * many layout rows were changed.
 *
 * Both the draft and the published copy are written, because a marker block the
 * owner cannot see is not something they can reasonably be expected to notice
 * and publish. The published copy is only touched where one already exists - a
 * layout that has never been published stays unpublished.
 */
export async function autoPlaceModuleBlocks(
  db: typeof prisma,
  moduleName: string
): Promise<number> {
  const entries: AutoPlaceEntry[] = moduleAutoPlaceBlocks()[moduleName] ?? []
  if (entries.length === 0) return 0

  let changed = 0
  for (const entry of entries) {
    const layouts = await db.layout.findMany({
      where: { type: entry.layoutType },
      select: { id: true, builderData: true, publishedData: true },
    })
    for (const layout of layouts) {
      const props = { id: blockId(entry.type) }
      const draft = withBlockPlaced(layout.builderData, entry.type, props, entry.position)
      const published = layout.publishedData
        ? withBlockPlaced(layout.publishedData, entry.type, props, entry.position)
        : null
      if (!draft && !published) continue
      await db.layout.update({
        where: { id: layout.id },
        data: {
          ...(draft ? { builderData: draft as never } : {}),
          ...(published ? { publishedData: published as never } : {}),
        },
      })
      changed++
    }
  }
  return changed
}
