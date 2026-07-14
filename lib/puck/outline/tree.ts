import type { Config, Data } from '@puckeditor/core'

/**
 * Puck's root content lives in a zone with this compound id. Every other zone is
 * `${parentComponentId}:${slotOrZoneName}` - true for both slot fields and the
 * legacy renderDropZone API, which is why a single string keys everything here.
 */
export const ROOT_ZONE = 'root:default-zone'

export type OutlineZone = {
  compound: string
  parentId: string
  label: string
  items: OutlineItem[]
}

export type OutlineItem = {
  id: string
  type: string
  label: string
  /** Zone compound this item currently sits in. */
  zone: string
  /** Index within that zone's content array. */
  index: number
  zones: OutlineZone[]
}

type ItemData = { type: string; props?: Record<string, unknown> }
type ZoneMap = Record<string, ItemData[]>
type OutlineData = Pick<Data, 'content'> & { zones?: ZoneMap }

type SlotField = { type?: string; label?: string }

function fieldsFor(config: Config, type: string): Record<string, SlotField> {
  return (config.components?.[type]?.fields ?? {}) as Record<string, SlotField>
}

function slotKeys(config: Config, type: string): string[] {
  const fields = fieldsFor(config, type)
  return Object.keys(fields).filter((key) => fields[key]?.type === 'slot')
}

/** Build the zone/item tree straight from public app state - no Puck internals. */
export function buildOutline(data: OutlineData, config: Config): OutlineZone[] {
  const legacyZones: ZoneMap = data.zones ?? {}

  const buildItems = (content: unknown, zoneCompound: string): OutlineItem[] => {
    if (!Array.isArray(content)) return []
    return (content as ItemData[])
      .filter((item) => item && typeof item.type === 'string')
      .map((item, index) => buildItem(item, zoneCompound, index))
  }

  const buildItem = (item: ItemData, zone: string, index: number): OutlineItem => {
    const id = String(item.props?.id ?? '')
    const type = item.type
    const fields = fieldsFor(config, type)
    const zones: OutlineZone[] = []

    for (const key of slotKeys(config, type)) {
      const compound = `${id}:${key}`
      zones.push({
        compound,
        parentId: id,
        label: fields[key]?.label ?? key,
        items: buildItems(item.props?.[key], compound),
      })
    }

    // Legacy renderDropZone zones live in data.zones, not in props.
    for (const compound of Object.keys(legacyZones)) {
      const [parentId, name] = compound.split(':')
      if (parentId !== id || zones.some((z) => z.compound === compound)) continue
      zones.push({
        compound,
        parentId: id,
        label: name ?? compound,
        items: buildItems(legacyZones[compound], compound),
      })
    }

    return {
      id,
      type,
      label: config.components?.[type]?.label ?? type,
      zone,
      index,
      zones,
    }
  }

  const roots: OutlineZone[] = [{
    compound: ROOT_ZONE,
    parentId: 'root',
    label: '',
    items: buildItems(data.content, ROOT_ZONE),
  }]

  for (const compound of Object.keys(legacyZones)) {
    const [parentId, name] = compound.split(':')
    if (parentId !== 'root' || compound === ROOT_ZONE) continue
    roots.push({
      compound,
      parentId: 'root',
      label: name ?? compound,
      items: buildItems(legacyZones[compound], compound),
    })
  }

  return roots
}

export type OutlineIndex = {
  itemById: Map<string, OutlineItem>
  /** Component id -> compound of the zone holding it. */
  parentZoneById: Map<string, string>
}

export function indexOutline(zones: OutlineZone[]): OutlineIndex {
  const itemById = new Map<string, OutlineItem>()
  const parentZoneById = new Map<string, string>()

  const walk = (zone: OutlineZone) => {
    for (const item of zone.items) {
      itemById.set(item.id, item)
      parentZoneById.set(item.id, zone.compound)
      item.zones.forEach(walk)
    }
  }
  zones.forEach(walk)

  return { itemById, parentZoneById }
}

/** Ancestor component ids of `id`, nearest first. Used to keep the selected path open. */
export function ancestorIds(id: string | null, index: OutlineIndex): Set<string> {
  const out = new Set<string>()
  if (!id) return out
  let current = index.parentZoneById.get(id)?.split(':')[0]
  while (current && current !== 'root' && !out.has(current)) {
    out.add(current)
    current = index.parentZoneById.get(current)?.split(':')[0]
  }
  return out
}

/** True when `zoneCompound` sits inside `itemId`'s own subtree - dropping there would orphan the branch. */
export function zoneIsInsideItem(zoneCompound: string, itemId: string, index: OutlineIndex): boolean {
  let parentId: string | undefined = zoneCompound.split(':')[0]
  const seen = new Set<string>()
  while (parentId && parentId !== 'root') {
    if (parentId === itemId) return true
    if (seen.has(parentId)) return false
    seen.add(parentId)
    parentId = index.parentZoneById.get(parentId)?.split(':')[0]
  }
  return false
}

export type OutlineRow =
  | { key: string; kind: 'item'; depth: number; item: OutlineItem; expandable: boolean; expanded: boolean }
  | { key: string; kind: 'zone'; depth: number; zone: OutlineZone }
  | { key: string; kind: 'empty'; depth: number; zone: OutlineZone }

/** Visible rows, in render order. `isExpanded` decides whether an item's child zones are walked. */
export function flattenOutline(
  roots: OutlineZone[],
  isExpanded: (itemId: string) => boolean,
): OutlineRow[] {
  const rows: OutlineRow[] = []

  const pushItems = (zone: OutlineZone, depth: number) => {
    if (zone.items.length === 0) {
      rows.push({ key: `empty:${zone.compound}`, kind: 'empty', depth, zone })
      return
    }
    for (const item of zone.items) {
      const expandable = item.zones.length > 0
      const expanded = expandable && isExpanded(item.id)
      rows.push({ key: `item:${item.id}`, kind: 'item', depth, item, expandable, expanded })
      if (!expanded) continue
      for (const childZone of item.zones) {
        rows.push({ key: `zone:${childZone.compound}`, kind: 'zone', depth: depth + 1, zone: childZone })
        pushItems(childZone, depth + 2)
      }
    }
  }

  for (const root of roots) {
    if (root.label) {
      rows.push({ key: `zone:${root.compound}`, kind: 'zone', depth: 0, zone: root })
      pushItems(root, 1)
    } else {
      pushItems(root, 0)
    }
  }

  return rows
}

export type MoveArgs = {
  sourceZone: string
  sourceIndex: number
  destinationZone: string
  destinationIndex: number
}

/**
 * Translate "insert before position N of the target zone as it looks now" into Puck's move action.
 * Within one zone Puck removes the item first and only then inserts, so an insertion point below
 * the item's current slot shifts up by one.
 */
export function computeMove(
  source: { zone: string; index: number },
  target: { zone: string; insertIndex: number },
): MoveArgs | null {
  let destinationIndex = target.insertIndex

  if (source.zone === target.zone) {
    if (source.index < destinationIndex) destinationIndex -= 1
    if (destinationIndex === source.index) return null
  }

  return {
    sourceZone: source.zone,
    sourceIndex: source.index,
    destinationZone: target.zone,
    destinationIndex,
  }
}
