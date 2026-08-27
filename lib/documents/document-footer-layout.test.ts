import { describe, it, expect } from 'vitest'
import { getModuleLayoutPuckConfig, puckConfig } from '@/lib/puck/config'
import { moduleComponents } from '@/lib/puck/module-components'
import { getStarterTemplates, CORE_STARTER_TEMPLATES } from '@/lib/layout/starter-templates'
import { CORE_LAYOUT_TYPES, isKnownLayoutType } from '@/lib/layout/layout-type-tabs'
import { isCoreModuleStyleLayoutType } from '@/lib/puck/core-layout-roots'
import { DOCUMENT_FOOTER_LAYOUT_TYPE } from '@/lib/documents/page-settings'

// `documentFooter` is the first layout type CORE owns that is built the way a
// MODULE's is: its picker is the blocks declared for that type plus the shared
// core ones, and its root fields come from a hand-written map rather than the
// generated one.
//
// That crosses four places - the tab list, the starters, the two Puck config
// builders - and three of them are switch statements whose default branch used
// to ask "is this a module type?" and answer no. Get any one of them wrong and
// the type still exists, still saves and still publishes; it simply opens in the
// wrong editor with the wrong blocks, or drops its page settings, and nothing
// anywhere goes red. So the four are pinned here.

function collectBlockTypes(data: unknown): string[] {
  const types: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (!node || typeof node !== 'object') return
    const rec = node as Record<string, unknown>
    if (typeof rec.type === 'string' && rec.props && typeof rec.props === 'object') types.push(rec.type)
    Object.values(rec).forEach(walk)
  }
  walk(data)
  return types
}

describe('the shared document footer is a layout type an owner can reach', () => {
  it('is listed as a core layout type', () => {
    expect(CORE_LAYOUT_TYPES.map((t) => t.key)).toContain(DOCUMENT_FOOTER_LAYOUT_TYPE)
    expect(isKnownLayoutType(DOCUMENT_FOOTER_LAYOUT_TYPE)).toBe(true)
  })

  it('is edited through the module-layout config, not one of the page configs', () => {
    expect(isCoreModuleStyleLayoutType(DOCUMENT_FOOTER_LAYOUT_TYPE)).toBe(true)
  })

  it('carries its own page settings on the root', () => {
    const root = getModuleLayoutPuckConfig(DOCUMENT_FOOTER_LAYOUT_TYPE).root
    // Without these the strip has no alignment or inset, and a layout saved
    // before the fields went missing quietly loses both.
    expect(Object.keys(root.fields ?? {})).toEqual(['align', 'inset'])
    expect(root.defaultProps).toEqual({ align: 'stretch', inset: '0' })
  })

  it('offers starters, and none of them publishes itself', () => {
    const starters = getStarterTemplates(DOCUMENT_FOOTER_LAYOUT_TYPE)
    expect(starters.length).toBeGreaterThan(0)
    // Seeding one would silently redesign the footer on every document a live
    // site prints - a module's own older footer layout is only preferred for as
    // long as nobody has published one of these.
    expect(starters.some((s) => s.publishByDefault)).toBe(false)
  })

  it('registers every core block its starters use', () => {
    const moduleBlocks = new Set(Object.keys(moduleComponents))
    const coreBlocks = new Set(Object.keys(puckConfig.components).filter((n) => !moduleBlocks.has(n)))
    const registered = new Set(Object.keys(getModuleLayoutPuckConfig(DOCUMENT_FOOTER_LAYOUT_TYPE).components))
    const used = new Set(
      (CORE_STARTER_TEMPLATES[DOCUMENT_FOOTER_LAYOUT_TYPE] ?? []).flatMap((s) => collectBlockTypes(s.data)),
    )
    const missing = [...used].filter((t) => coreBlocks.has(t) && !registered.has(t)).sort()
    expect(missing, `unregistered in ${DOCUMENT_FOOTER_LAYOUT_TYPE}: ${missing.join(', ')}`).toEqual([])
  })
})
