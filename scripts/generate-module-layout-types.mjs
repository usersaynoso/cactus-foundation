#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getModuleNames as registeredModuleNames } from './lib/module-names.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const modulesDir = join(rootDir, 'modules')
const typesOutPath = join(rootDir, 'lib', 'layout', 'module-layout-types.ts')
const startersOutPath = join(rootDir, 'lib', 'setup', 'module-starter-layouts.ts')
const embedOptionsOutPath = join(rootDir, 'lib', 'puck', 'module-embed-options.ts')
const embedInjectOutPath = join(rootDir, 'lib', 'puck', 'module-embed-inject.ts')
const layoutRootsOutPath = join(rootDir, 'lib', 'puck', 'module-layout-roots.ts')

// Registry-filtered: see scripts/lib/module-names.mjs for why a bare directory
// listing is not good enough here.
function getModuleNames() {
  return registeredModuleNames(rootDir)
}

const moduleNames = getModuleNames()
const modulesInBuild = []
// moduleName -> the blocks it asks core to place on first install.
const autoPlaceByModule = {}
const declaredGroups = []
const starterImports = []
const starterEntries = []
// Starters contributed to a layout type the contributing module does NOT own.
// Keyed by layout type, because more than one module may contribute to the same
// one - `documentFooter` is core's, and every module that prints paperwork has
// a footer worth offering.
const starterContributionImports = new Set()
const starterContributionsByType = {}
const embedOptionEntries = []
const embedInjectImports = []
const embedInjectEntries = []
const layoutRootImports = []
const layoutRootEntries = []

for (const moduleName of moduleNames) {
  const manifestPath = join(modulesDir, moduleName, 'cactus.module.json')
  if (!existsSync(manifestPath)) continue

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    console.warn(`[generate-module-layout-types] Could not parse ${manifestPath} — skipping`)
    continue
  }

  // Recorded before the layoutTypes check: this list answers "was this module's
  // code in this build?", which is a different question from "does it declare
  // layout types". A module absent from it has nothing to seed *yet*; a module
  // present but with no layout types has nothing to seed *ever*. Telling those
  // two apart is what keeps seedPendingModuleLayouts() from stamping a module
  // whose code has not landed - see lib/setup/starterLayouts.ts.
  modulesInBuild.push(moduleName)

  // Collected BEFORE the layoutTypes check below, which `continue`s past every
  // module that declares none. A module can perfectly well auto-place a block
  // into somebody else's layout type (a marker block for the site header, say)
  // without owning a layout type of its own - google-tag being exactly that -
  // and gathering this afterwards would silently skip all of them.
  const autoPlace = Array.isArray(manifest.autoPlaceBlocks) ? manifest.autoPlaceBlocks : []
  if (autoPlace.length > 0) {
    const entries = []
    for (const entry of autoPlace) {
      if (!entry?.type || !entry?.layoutType) {
        console.warn(`[generate-module-layout-types] ${moduleName}: autoPlaceBlocks entry needs both type and layoutType — skipping`)
        continue
      }
      entries.push({
        type: entry.type,
        layoutType: entry.layoutType,
        ...(entry.position === 'start' ? { position: 'start' } : {}),
      })
    }
    if (entries.length > 0) autoPlaceByModule[moduleName] = entries
  }

  // Starter templates a module offers for a layout type it does NOT own - core's
  // `documentFooter` being the case this exists for. The strip at the foot of a
  // printed page is core's layout type, but the blocks worth putting on it (a
  // page number, a registration line) belong to whichever module prints the
  // paperwork, and so do the starters made of them.
  //
  // Collected BEFORE the layoutTypes check below, for the same reason
  // autoPlaceBlocks is: contributing to somebody else's layout type does not
  // require owning one. A separate manifest key rather than an entry in
  // `layoutTypes.types` on purpose - an older core reading this manifest ignores
  // a key it has never heard of, where a types entry would be registered as a
  // layout type of the module's own and put the tab straight back.
  const layoutStarters = Array.isArray(manifest.layoutStarters) ? manifest.layoutStarters : []
  for (const entry of layoutStarters) {
    if (!entry?.layoutType || !entry?.import || !entry?.export) {
      console.warn(`[generate-module-layout-types] ${moduleName}: layoutStarters entry needs layoutType, import and export — skipping`)
      continue
    }
    const importPath = entry.import.replace(/^\.\//, `@/modules/${moduleName}/`)
    const safeModule = moduleName.replace(/-/g, '_')
    const ident = `_contrib_${safeModule}_${entry.export}`
    starterContributionImports.add(`import { ${entry.export} as ${ident} } from '${importPath}'`)
    ;(starterContributionsByType[entry.layoutType] ||= []).push(ident)
  }

  const layoutTypes = manifest.layoutTypes
  if (!layoutTypes || !Array.isArray(layoutTypes.types) || layoutTypes.types.length === 0) continue
  if (!layoutTypes.groupLabel) {
    console.warn(`[generate-module-layout-types] Missing groupLabel in ${moduleName} — skipping`)
    continue
  }

  const types = []
  for (const t of layoutTypes.types) {
    if (!t.key || !t.label) {
      console.warn(`[generate-module-layout-types] Invalid layoutTypes entry in ${moduleName} — skipping`)
      continue
    }
    // editorPreview: the container a layout of this type is normally stamped
    // into by its host surface, described as plain data so the standalone
    // editor and preview page can reproduce it. A "block-internal" layout (a
    // product card, say) is a flat list of parts whose arrangement comes from
    // the class on that container, so without it every template of the type
    // renders identically - and an absolutely-positioned part escapes to the
    // canvas. Client-safe: a class name and a width, never a component.
    // moduleName is the module that *owns* the type, which is not always the
    // module whose group tab it appears under - see layoutTypes.host below.
    // Everything that gates on "is this module installed" reads this one.
    types.push({ key: t.key, label: t.label, moduleName, ...(t.editorPreview ? { editorPreview: t.editorPreview } : {}) })

    if (t.starterImport && t.starterExport) {
      const importPath = t.starterImport.replace(/^\.\//, `@/modules/${moduleName}/`)
      const safeModule = moduleName.replace(/-/g, '_')
      const ident = `_${safeModule}_${t.starterExport}`
      starterImports.push(`import { ${t.starterExport} as ${ident} } from '${importPath}'`)
      starterEntries.push(`  ${JSON.stringify(t.key)}: ${ident},`)
    }

    // Embed options: a plain-data schema (client-safe) describing the fields a
    // core "Embed Layout" block should show when this layout type is embedded.
    if (Array.isArray(t.embedOptions) && t.embedOptions.length > 0) {
      embedOptionEntries.push(`  ${JSON.stringify(t.key)}: ${JSON.stringify(t.embedOptions)},`)
    }

    // Embed injector: a server-only function that maps those option values onto
    // the blocks inside the embedded layout's builderData before it renders.
    if (t.embedInjectImport && t.embedInjectExport) {
      const importPath = t.embedInjectImport.replace(/^\.\//, `@/modules/${moduleName}/`)
      const safeModule = moduleName.replace(/-/g, '_')
      const ident = `_embed_${safeModule}_${t.embedInjectExport}`
      embedInjectImports.push(`import { ${t.embedInjectExport} as ${ident} } from '${importPath}'`)
      embedInjectEntries.push(`  ${JSON.stringify(t.key)}: ${ident},`)
    }

    // Page settings: the root-level fields the layout editor shows with nothing
    // selected, declared by the module that owns the layout type. This is how a
    // document layout gets settings that belong to the SHEET rather than to any
    // block on it - a PDF's paper size and its margins being the case it was
    // built for. The export is a plain object of Puck root fields, their
    // defaults, and an optional `before` component rendered ahead of the
    // layout's own blocks (which is where the @page rules come from).
    //
    // Client-safe, and it has to stay that way: this one generated file is
    // imported by BOTH the editor config and the RSC one, so anything reaching
    // next/headers from here would poison the editor bundle.
    if (t.pageSettingsImport && t.pageSettingsExport) {
      const importPath = t.pageSettingsImport.replace(/^\.\//, `@/modules/${moduleName}/`)
      const safeModule = moduleName.replace(/-/g, '_')
      const ident = `_root_${safeModule}_${t.pageSettingsExport}`
      // One import per identifier: a module usually declares the SAME settings
      // for several layout types (the invoice and the proforma share a sheet),
      // and emitting the import once per type is a duplicate binding and a file
      // that will not compile.
      if (!layoutRootImports.some((line) => line.includes(` as ${ident} `))) {
        layoutRootImports.push(`import { ${t.pageSettingsExport} as ${ident} } from '${importPath}'`)
      }
      layoutRootEntries.push(`  ${JSON.stringify(t.key)}: ${ident},`)
    }
  }

  if (types.length > 0) {
    declaredGroups.push({
      moduleName,
      groupLabel: layoutTypes.groupLabel,
      host: typeof layoutTypes.host === 'string' ? layoutTypes.host : null,
      types,
    })
  }
}

// layoutTypes.host: "shop" means "my layout types belong under that module's tab,
// not a tab of my own". An add-on module whose pages are part of another module's
// surface - quote-for-shop's quote document is a Shop document - has no business
// opening a second top-level tab in the Layouts list for two entries.
//
// Two passes, because a module may declare a host that has not been read yet
// (module order is alphabetical, and "quote-for-shop" comes before "shop").
// A host that declares no layout types of its own, or is not in this build, is no
// host at all: the module keeps its own group rather than losing its types.
const groups = []
const groupByModule = new Map()
for (const d of declaredGroups) {
  if (d.host) continue
  const group = { moduleName: d.moduleName, groupLabel: d.groupLabel, types: d.types }
  groups.push(group)
  groupByModule.set(d.moduleName, group)
}
for (const d of declaredGroups) {
  if (!d.host) continue
  const host = groupByModule.get(d.host)
  if (host) {
    host.types.push(...d.types)
    continue
  }
  console.warn(`[generate-module-layout-types] ${d.moduleName} hosts into "${d.host}", which declares no layout types here - keeping its own group`)
  const group = { moduleName: d.moduleName, groupLabel: d.groupLabel, types: d.types }
  groups.push(group)
  groupByModule.set(d.moduleName, group)
}

// ---------------------------------------------------------------------------
// lib/layout/module-layout-types.ts — pure data, no imports
// ---------------------------------------------------------------------------

mkdirSync(dirname(typesOutPath), { recursive: true })

const typesOut = []
typesOut.push(`// AUTO-GENERATED by scripts/generate-module-layout-types.mjs`)
typesOut.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
typesOut.push(``)
typesOut.push(`/** The host container a layout type is stamped into, for the editor to mirror. */`)
typesOut.push(`export type ModuleLayoutEditorPreview = { className?: string; maxWidth?: number }`)
typesOut.push(``)
typesOut.push(`export type ModuleLayoutTypeGroup = {`)
typesOut.push(`  /** The module whose tab these types appear under. */`)
typesOut.push(`  moduleName: string`)
typesOut.push(`  groupLabel: string`)
typesOut.push(`  /** \`moduleName\` on a type is the module that owns it, which is the one that has`)
typesOut.push(`   *  to be installed for it to count - not necessarily the group's module. */`)
typesOut.push(`  types: { key: string; label: string; moduleName: string; editorPreview?: ModuleLayoutEditorPreview }[]`)
typesOut.push(`}`)
typesOut.push(``)
typesOut.push(`/** Every module whose code was cloned into this build, layout types or not. */`)
typesOut.push(`export const modulesInBuild: string[] = ${JSON.stringify(modulesInBuild, null, 2)}`)
typesOut.push(``)
typesOut.push(`export const moduleLayoutTypeGroups: ModuleLayoutTypeGroup[] = ${JSON.stringify(groups, null, 2)}`)
typesOut.push(``)
typesOut.push(`export const moduleLayoutTypeToGroup: Record<string, { moduleName: string; groupLabel: string; label: string; editorPreview?: ModuleLayoutEditorPreview }> = {}`)
typesOut.push(`for (const group of moduleLayoutTypeGroups) {`)
typesOut.push(`  for (const t of group.types) {`)
typesOut.push(`    moduleLayoutTypeToGroup[t.key] = { moduleName: t.moduleName, groupLabel: group.groupLabel, label: t.label, editorPreview: t.editorPreview }`)
typesOut.push(`  }`)
typesOut.push(`}`)

typesOut.push(``)
typesOut.push(`/** Blocks a module asks core to place onto matching layouts when it is FIRST`)
typesOut.push(` *  installed. See lib/layout/auto-place-blocks.ts - never re-applied on update. */`)
typesOut.push(`export type ModuleAutoPlaceEntry = { type: string; layoutType: string; position?: 'start' | 'end' }`)
typesOut.push(`const AUTO_PLACE_BLOCKS: Record<string, ModuleAutoPlaceEntry[]> = ${JSON.stringify(autoPlaceByModule, null, 2)}`)
typesOut.push(`export function moduleAutoPlaceBlocks(): Record<string, ModuleAutoPlaceEntry[]> { return AUTO_PLACE_BLOCKS }`)

writeFileSync(typesOutPath, typesOut.join('\n') + '\n')

// ---------------------------------------------------------------------------
// lib/setup/module-starter-layouts.ts — starter template loaders
// ---------------------------------------------------------------------------

mkdirSync(dirname(startersOutPath), { recursive: true })

const startersOut = []
startersOut.push(`// AUTO-GENERATED by scripts/generate-module-layout-types.mjs`)
startersOut.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
startersOut.push(``)
for (const imp of starterImports) startersOut.push(imp)
for (const imp of starterContributionImports) startersOut.push(imp)
if (starterImports.length > 0 || starterContributionImports.size > 0) startersOut.push(``)

startersOut.push(`// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
startersOut.push(`export const moduleStarterLayouts: Record<string, () => any[]> = {`)
for (const e of starterEntries) startersOut.push(e)
startersOut.push(`}`)
startersOut.push(``)
startersOut.push(`/** Starters offered for a layout type the contributing module does NOT own -`)
startersOut.push(` *  core's \`documentFooter\` being the one this exists for. Appended to whatever`)
startersOut.push(` *  the type already offers rather than replacing it, so several modules can`)
startersOut.push(` *  each put their own footer on the menu. */`)
startersOut.push(`// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
startersOut.push(`export const moduleLayoutStarterContributions: Record<string, (() => any[])[]> = {`)
for (const [layoutType, idents] of Object.entries(starterContributionsByType)) {
  startersOut.push(`  ${JSON.stringify(layoutType)}: [${idents.join(', ')}],`)
}
startersOut.push(`}`)

writeFileSync(startersOutPath, startersOut.join('\n') + '\n')

// ---------------------------------------------------------------------------
// lib/puck/module-embed-options.ts — pure data, client-safe (imported by the
// Puck editor config's resolveFields)
// ---------------------------------------------------------------------------

mkdirSync(dirname(embedOptionsOutPath), { recursive: true })

const embedOptionsOut = []
embedOptionsOut.push(`// AUTO-GENERATED by scripts/generate-module-layout-types.mjs`)
embedOptionsOut.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
embedOptionsOut.push(``)
embedOptionsOut.push(`export type EmbedOption = {`)
embedOptionsOut.push(`  key: string`)
embedOptionsOut.push(`  label: string`)
embedOptionsOut.push(`  type: 'text' | 'number' | 'select'`)
embedOptionsOut.push(`  default?: string | number`)
embedOptionsOut.push(`  placeholder?: string`)
embedOptionsOut.push(`  options?: { value: string; label: string }[]`)
embedOptionsOut.push(`}`)
embedOptionsOut.push(``)
embedOptionsOut.push(`export const moduleEmbedOptions: Record<string, EmbedOption[]> = {`)
for (const e of embedOptionEntries) embedOptionsOut.push(e)
embedOptionsOut.push(`}`)

writeFileSync(embedOptionsOutPath, embedOptionsOut.join('\n') + '\n')

// ---------------------------------------------------------------------------
// lib/puck/module-embed-inject.ts — server-only injector loaders (imported by
// the RSC LayoutEmbed render)
// ---------------------------------------------------------------------------

mkdirSync(dirname(embedInjectOutPath), { recursive: true })

const embedInjectOut = []
embedInjectOut.push(`// AUTO-GENERATED by scripts/generate-module-layout-types.mjs`)
embedInjectOut.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
embedInjectOut.push(``)
for (const imp of embedInjectImports) embedInjectOut.push(imp)
if (embedInjectImports.length > 0) embedInjectOut.push(``)
embedInjectOut.push(`export type EmbedInjector = (data: any, values: Record<string, unknown>) => any`)
embedInjectOut.push(`export const moduleEmbedInjectors: Record<string, EmbedInjector> = {`)
for (const e of embedInjectEntries) embedInjectOut.push(e)
embedInjectOut.push(`}`)

writeFileSync(embedInjectOutPath, embedInjectOut.join('\n') + '\n')

// ---------------------------------------------------------------------------
// lib/puck/module-layout-roots.ts — page settings for module layout types
// ---------------------------------------------------------------------------

mkdirSync(dirname(layoutRootsOutPath), { recursive: true })

const layoutRootsOut = []
layoutRootsOut.push(`// AUTO-GENERATED by scripts/generate-module-layout-types.mjs`)
layoutRootsOut.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
layoutRootsOut.push(`// Client-safe: imported by BOTH lib/puck/config.tsx (the editor) and`)
layoutRootsOut.push(`// lib/puck/config.rsc.tsx (the published render). Nothing reachable from a`)
layoutRootsOut.push(`// module's page-settings export may touch next/headers or any server-only API.`)
layoutRootsOut.push(``)
for (const imp of layoutRootImports) layoutRootsOut.push(imp)
if (layoutRootImports.length > 0) layoutRootsOut.push(``)
layoutRootsOut.push(`/** Root ("page settings") config a module declares for one of its layout types.`)
layoutRootsOut.push(` *  \`fields\` and \`defaultProps\` are ordinary Puck root config; \`before\` is an`)
layoutRootsOut.push(` *  optional component rendered ahead of the layout's blocks, which is how a`)
layoutRootsOut.push(` *  document turns its page settings into @page rules. */`)
layoutRootsOut.push(`export type ModuleLayoutRoot = { fields?: Record<string, any>; defaultProps?: Record<string, any>; before?: (props: any) => any }`)
layoutRootsOut.push(``)
layoutRootsOut.push(`export const moduleLayoutRoots: Record<string, ModuleLayoutRoot> = {`)
for (const e of layoutRootEntries) layoutRootsOut.push(e)
layoutRootsOut.push(`}`)

writeFileSync(layoutRootsOutPath, layoutRootsOut.join('\n') + '\n')

console.log(
  `[generate-module-layout-types] module-layout-types.ts + module-starter-layouts.ts written (${groups.length} group(s): ${groups.map(g => g.groupLabel).join(', ') || 'none'})`
)
