// The editor's Puck config: core blocks (lib/puck/config.core.tsx) plus every
// installed module's block, merged back in here.
//
// This file exists so that ONE import edge can be kept out of the published
// render path. lib/puck/module-components.ts statically imports all 118 module
// block client components; config.core.tsx is reached from config.rsc.tsx, which
// every public page renders through, so while the two lived in one file every
// visitor to every page downloaded every module's client code. None of it was
// ever rendered there - each of the 118 blocks has an RSC half that overrides it.
//
// Everything `@/lib/puck/config` exported before the split it still exports, with
// the same names and the same contents, so both admin editors and any module
// importing from here (shop's description builder) are unaffected.
//
// The rule this file protects: config.core.tsx must not import module-components.
// Enforced by lib/puck/config.core.test.ts.

import { moduleComponents, moduleComponentsByLayoutType } from '@/lib/puck/module-components'
// Page settings a module declares for its own layout types - the fields the
// editor shows with nothing selected. Same generated file the RSC config reads,
// so the editor and the published document agree on the root by construction.
import { moduleLayoutRoots } from '@/lib/puck/module-layout-roots'
// The same thing for the layout types core owns but builds the module way - the
// shared document footer. Hand-written, because nothing generates core.
import { coreLayoutRoots } from '@/lib/puck/core-layout-roots'
import {
  puckConfig as corePuckConfig,
  footerPuckConfig as coreFooterPuckConfig,
  layoutPuckConfig as coreLayoutPuckConfig,
  headerPuckConfig as coreHeaderPuckConfig,
  getModuleLayoutSharedParts,
  moduleLayoutEditorRoot,
  withResponsiveVisibility,
} from '@/lib/puck/config.core'

export * from '@/lib/puck/config.core'

// Module blocks reach the editor through the same responsive-visibility wrapper
// core blocks do - it is what adds the "hide on mobile/tablet/desktop" fields and
// the applicable-only field trims. config.core.tsx applies it to its own blocks
// inside each config; module blocks are merged after that, so they need it here.
function wrapped(blocks: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(blocks).map(([name, def]) => [name, withResponsiveVisibility(def)]))
}

const allModuleBlocks = wrapped(moduleComponents)
const footerModuleBlocks = wrapped(moduleComponentsByLayoutType['footer'] ?? {})
const headerModuleBlocks = wrapped(moduleComponentsByLayoutType['header'] ?? {})

// Only offered when a module actually contributed one, same as before the split:
// an empty "Blocks" heading in the header or footer picker is worse than none.
function blocksCategory(blocks: Record<string, any>) {
  return Object.keys(blocks).length > 0
    ? { blocks: { title: 'Blocks', components: Object.keys(blocks), defaultExpanded: true } }
    : {}
}

export const puckConfig = {
  ...corePuckConfig,
  categories: {
    ...corePuckConfig.categories,
    modules: { title: 'Modules', components: Object.keys(allModuleBlocks), defaultExpanded: true },
  },
  components: { ...corePuckConfig.components, ...allModuleBlocks },
}

export default puckConfig
export type PuckConfig = typeof puckConfig

export const footerPuckConfig = {
  ...coreFooterPuckConfig,
  categories: { ...coreFooterPuckConfig.categories, ...blocksCategory(footerModuleBlocks) },
  components: { ...coreFooterPuckConfig.components, ...footerModuleBlocks },
}

export const layoutPuckConfig = {
  ...coreLayoutPuckConfig,
  categories: {
    ...coreLayoutPuckConfig.categories,
    modules: { title: 'Modules', components: Object.keys(allModuleBlocks), defaultExpanded: true },
  },
  components: { ...coreLayoutPuckConfig.components, ...allModuleBlocks },
}

export const headerPuckConfig = {
  ...coreHeaderPuckConfig,
  categories: { ...coreHeaderPuckConfig.categories, ...blocksCategory(headerModuleBlocks) },
  components: { ...coreHeaderPuckConfig.components, ...headerModuleBlocks },
}

export const fullPagePuckConfig = puckConfig

export function getModuleLayoutPuckConfig(layoutType: string) {
  const modBlocks = wrapped(moduleComponentsByLayoutType[layoutType] ?? {})
  const { sharedCategories, sharedComponents } = getModuleLayoutSharedParts()
  // A layout type that declares none keeps root.fields undefined, which is what
  // LayoutPuckEditor reads to decide whether to hide the root panel entirely -
  // so a product card gains nothing it has no use for.
  const pageRoot = moduleLayoutRoots[layoutType] ?? coreLayoutRoots[layoutType]
  return {
    categories: {
      blocks: { title: 'Blocks', components: Object.keys(modBlocks), defaultExpanded: true },
      ...sharedCategories,
    },
    root: {
      ...(pageRoot?.fields ? { fields: pageRoot.fields } : {}),
      ...(pageRoot?.defaultProps ? { defaultProps: pageRoot.defaultProps } : {}),
      render: moduleLayoutEditorRoot(layoutType, pageRoot?.before),
    },
    components: { ...sharedComponents, ...modBlocks },
  }
}

// Kept because it has always been exported from '@/lib/puck/config' and module
// code is pinned independently of core. Every caller in this tree uses the real
// RSC one in config.rsc.tsx instead.
export function getModuleLayoutPuckRscConfig(layoutType: string) {
  return getModuleLayoutPuckConfig(layoutType)
}
