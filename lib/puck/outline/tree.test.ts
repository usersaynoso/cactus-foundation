import { describe, expect, it } from 'vitest'
import type { Config } from '@puckeditor/core'
import {
  ROOT_ZONE,
  ancestorIds,
  buildOutline,
  computeMove,
  flattenOutline,
  indexOutline,
  zoneIsInsideItem,
  type OutlineZone,
} from './tree'

const config = {
  components: {
    Heading: { label: 'Heading', fields: {}, render: () => null },
    Columns: {
      label: 'Columns',
      fields: { col1: { type: 'slot' }, col2: { type: 'slot', label: 'Right column' } },
      render: () => null,
    },
    Split: { label: 'Split', fields: {}, render: () => null },
  },
} as unknown as Config

const item = (type: string, id: string, props: Record<string, unknown> = {}) => ({
  type,
  props: { id, ...props },
})

/** Index access is unchecked under this tsconfig; fail loudly rather than assert on undefined. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`expected ${what}`)
  return value
}

const rootOf = (data: unknown): OutlineZone =>
  must(buildOutline(data as never, config)[0], 'root zone')

describe('buildOutline', () => {
  it('reads root content, slot content and legacy DropZone content', () => {
    const root = rootOf({
      content: [
        item('Heading', 'h1'),
        item('Columns', 'c1', { col1: [item('Heading', 'h2')], col2: [] }),
        item('Split', 's1'),
      ],
      zones: { 's1:left': [item('Heading', 'h3')] },
    })

    expect(root.compound).toBe(ROOT_ZONE)
    expect(root.items.map((i) => i.id)).toEqual(['h1', 'c1', 's1'])

    const columns = must(root.items[1], 'Columns item')
    expect(columns.zones.map((z) => z.compound)).toEqual(['c1:col1', 'c1:col2'])
    expect(must(columns.zones[0], 'col1').items[0]).toMatchObject({ id: 'h2', zone: 'c1:col1', index: 0 })
    // Zone label falls back to the slot name unless the field declares one.
    expect(columns.zones.map((z) => z.label)).toEqual(['col1', 'Right column'])

    const split = must(root.items[2], 'Split item')
    expect(split.zones).toHaveLength(1)
    expect(must(split.zones[0], 'split left zone').items.map((i) => i.id)).toEqual(['h3'])
  })

  it('labels items from the component config, falling back to the type', () => {
    const root = rootOf({ content: [item('Heading', 'h1'), item('Unknown', 'u1')] })
    expect(root.items.map((i) => i.label)).toEqual(['Heading', 'Unknown'])
  })
})

describe('indexOutline / ancestorIds / zoneIsInsideItem', () => {
  const roots = buildOutline({
    content: [
      item('Columns', 'c1', {
        col1: [item('Columns', 'c2', { col1: [item('Heading', 'h1')], col2: [] })],
        col2: [],
      }),
    ],
  } as never, config)
  const index = indexOutline(roots)

  it('maps every item to its parent zone', () => {
    expect(index.parentZoneById.get('c1')).toBe(ROOT_ZONE)
    expect(index.parentZoneById.get('c2')).toBe('c1:col1')
    expect(index.parentZoneById.get('h1')).toBe('c2:col1')
  })

  it('walks ancestors nearest first', () => {
    expect([...ancestorIds('h1', index)]).toEqual(['c2', 'c1'])
    expect([...ancestorIds(null, index)]).toEqual([])
  })

  it('rejects drops into the dragged item own subtree', () => {
    expect(zoneIsInsideItem('c2:col1', 'c1', index)).toBe(true)
    expect(zoneIsInsideItem('c1:col1', 'c1', index)).toBe(true)
    expect(zoneIsInsideItem(ROOT_ZONE, 'c1', index)).toBe(false)
    expect(zoneIsInsideItem('c1:col1', 'h1', index)).toBe(false)
  })
})

describe('flattenOutline', () => {
  const roots = buildOutline({
    content: [item('Heading', 'h1'), item('Columns', 'c1', { col1: [item('Heading', 'h2')], col2: [] })],
  } as never, config)

  it('hides child zones of collapsed containers', () => {
    const rows = flattenOutline(roots, () => false)
    expect(rows.map((r) => r.key)).toEqual(['item:h1', 'item:c1'])
    expect(rows[1]).toMatchObject({ kind: 'item', expandable: true, expanded: false })
  })

  it('emits zone headers and empty placeholders when expanded', () => {
    const rows = flattenOutline(roots, () => true)
    expect(rows.map((r) => r.key)).toEqual([
      'item:h1',
      'item:c1',
      'zone:c1:col1',
      'item:h2',
      'zone:c1:col2',
      'empty:c1:col2',
    ])
    expect(rows.find((r) => r.key === 'item:h2')?.depth).toBe(2)
  })

  it('gives an empty page a single drop placeholder', () => {
    const rows = flattenOutline(buildOutline({ content: [] } as never, config), () => true)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'empty', depth: 0 })
  })
})

describe('computeMove', () => {
  it('shifts the destination index down when moving further down its own zone', () => {
    // Puck removes the item before inserting, so "insert before slot 3" becomes index 2.
    expect(computeMove({ zone: ROOT_ZONE, index: 0 }, { zone: ROOT_ZONE, insertIndex: 3 })).toEqual({
      sourceZone: ROOT_ZONE,
      sourceIndex: 0,
      destinationZone: ROOT_ZONE,
      destinationIndex: 2,
    })
  })

  it('leaves the destination index alone when moving up its own zone', () => {
    expect(computeMove({ zone: ROOT_ZONE, index: 3 }, { zone: ROOT_ZONE, insertIndex: 1 })).toEqual({
      sourceZone: ROOT_ZONE,
      sourceIndex: 3,
      destinationZone: ROOT_ZONE,
      destinationIndex: 1,
    })
  })

  it('returns null for a no-op move', () => {
    expect(computeMove({ zone: ROOT_ZONE, index: 2 }, { zone: ROOT_ZONE, insertIndex: 2 })).toBeNull()
    expect(computeMove({ zone: ROOT_ZONE, index: 2 }, { zone: ROOT_ZONE, insertIndex: 3 })).toBeNull()
  })

  it('keeps the raw index when crossing zones', () => {
    expect(computeMove({ zone: ROOT_ZONE, index: 0 }, { zone: 'c1:col1', insertIndex: 1 })).toEqual({
      sourceZone: ROOT_ZONE,
      sourceIndex: 0,
      destinationZone: 'c1:col1',
      destinationIndex: 1,
    })
  })
})
