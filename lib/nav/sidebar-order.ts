import type { ResolvedNavItem, ResolvedNavSection } from './admin-menu'

// ---------------------------------------------------------------------------
// Per-user sidebar arrangement — the pure algebra behind drag-to-reorder.
//
// This is a PERSONAL preference, held in the browser, not a site-wide setting:
// the Navigation editor already owns the shared, permissioned ordering
// (AdminMenuConfig.items[].order) and one person shuffling their own rail must
// never move everybody else's. The server still decides which sections and items
// exist and who may see them; everything here only re-orders what it sent, and
// silently drops any id it no longer recognises.
//
// Kept framework-free (no React) so the rules can be tested on their own.
// ---------------------------------------------------------------------------

/** sectionId -> item ids, in the order this user wants them. */
export type NavOrderMap = Record<string, string[]>

export type NavDropTarget =
  | { kind: 'row'; id: string; edge: 'before' | 'after' }
  | { kind: 'section'; sectionId: string }

/**
 * localStorage is external input, so nothing is trusted on the way back in: a
 * hand-edited or half-written value yields an empty arrangement rather than a
 * crash on first paint. Unknown ids are discarded later, by applyNavOrder.
 */
export function parseNavOrder(raw: string): NavOrderMap {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const out: NavOrderMap = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    out[key] = value.filter((v): v is string => typeof v === 'string')
  }
  return out
}

/**
 * Lay a saved arrangement over what the server resolved. An id listed under a
 * section it did not come from has been dragged there and renders there; the
 * first section to claim an id wins, so a stale duplicate can never render the
 * same link twice. Anything the arrangement has never seen — a link a module
 * added since — keeps its server position, at the end of its own section.
 */
export function applyNavOrder(sections: ResolvedNavSection[], order: NavOrderMap): ResolvedNavSection[] {
  if (Object.keys(order).length === 0) return sections

  const byId = new Map<string, ResolvedNavItem>()
  for (const section of sections) for (const item of section.items) byId.set(item.id, item)

  const claimedBy = new Map<string, string>()
  for (const section of sections) {
    for (const id of order[section.id] ?? []) {
      if (!byId.has(id) || claimedBy.has(id)) continue
      claimedBy.set(id, section.id)
    }
  }

  return sections.map((section) => {
    const listed: ResolvedNavItem[] = []
    for (const id of order[section.id] ?? []) {
      if (claimedBy.get(id) !== section.id) continue
      const item = byId.get(id)
      if (item) listed.push(item)
    }
    const rest = section.items.filter((item) => !claimedBy.has(item.id))
    return { ...section, items: [...listed, ...rest] }
  })
}

/** Snapshot the sections as they currently read, minus one id being moved. */
function listsWithout(sections: ResolvedNavSection[], dragId: string): NavOrderMap {
  const lists: NavOrderMap = {}
  for (const section of sections) {
    lists[section.id] = section.items.map((item) => item.id).filter((id) => id !== dragId)
  }
  return lists
}

/**
 * The arrangement after a link is dropped. Takes the sections as they currently
 * READ (post-applyNavOrder) and writes every one of them back, not only the two
 * involved: a whole-tree record is the one shape that cannot half-apply if the
 * menu changes underneath it. Returns null when the drop changes nothing.
 */
export function orderAfterDrop(
  sections: ResolvedNavSection[],
  dragId: string,
  target: NavDropTarget
): NavOrderMap | null {
  const lists = listsWithout(sections, dragId)

  if (target.kind === 'section') {
    const list = lists[target.sectionId]
    if (!list) return null
    list.push(dragId)
    return lists
  }

  if (target.id === dragId) return null
  for (const section of sections) {
    const ids = lists[section.id]
    if (!ids) continue
    const idx = ids.indexOf(target.id)
    if (idx === -1) continue
    ids.splice(target.edge === 'before' ? idx : idx + 1, 0, dragId)
    return lists
  }
  return null
}

/**
 * The arrangement after Alt+Arrow nudges a link one place. One flat walk of the
 * whole tree, so a step off the end of a section lands in the next one — the
 * same reach a drag has. Returns null at the very top and very bottom.
 */
export function orderAfterKeyboardMove(
  sections: ResolvedNavSection[],
  id: string,
  delta: -1 | 1
): NavOrderMap | null {
  const flat = sections.flatMap((section) =>
    section.items.map((item) => ({ sectionId: section.id, id: item.id }))
  )
  const from = flat.findIndex((entry) => entry.id === id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= flat.length) return null
  const anchor = flat[to]
  if (!anchor) return null

  flat.splice(from, 1)
  const anchorAt = flat.findIndex((entry) => entry.id === anchor.id)
  flat.splice(anchorAt + (delta > 0 ? 1 : 0), 0, { sectionId: anchor.sectionId, id })

  const lists: NavOrderMap = {}
  for (const section of sections) lists[section.id] = []
  for (const entry of flat) lists[entry.sectionId]?.push(entry.id)
  return lists
}

/**
 * Favourites are their own ordered list, so reordering one is just an array
 * move. Ids that are no longer on the menu are left where they sit rather than
 * quietly unpinned — the item may come back when its module is reinstalled.
 */
export function favouritesAfterDrop(
  favourites: string[],
  dragId: string,
  target: NavDropTarget
): string[] | null {
  if (target.kind !== 'row' || target.id === dragId) return null
  if (!favourites.includes(dragId)) return null
  const next = favourites.filter((id) => id !== dragId)
  const idx = next.indexOf(target.id)
  if (idx === -1) return null
  next.splice(target.edge === 'before' ? idx : idx + 1, 0, dragId)
  return next
}

export function favouritesAfterKeyboardMove(
  favourites: string[],
  id: string,
  delta: -1 | 1
): string[] | null {
  const from = favourites.indexOf(id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= favourites.length) return null
  const next = [...favourites]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return null
  next.splice(to, 0, moved)
  return next
}
