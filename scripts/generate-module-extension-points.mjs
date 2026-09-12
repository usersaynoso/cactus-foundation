#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getModuleNames as registeredModuleNames } from './lib/module-names.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const modulesDir = join(rootDir, 'modules')
const outPath = join(rootDir, 'lib', 'modules', 'extension-points.ts')
const publicOutPath = join(rootDir, 'lib', 'modules', 'extension-points.public.ts')
const serverOutPath = join(rootDir, 'lib', 'modules', 'extension-points.server.ts')
const metaOutPath = join(rootDir, 'lib', 'modules', 'extension-points.meta.ts')

// An extension component living under components/admin/ only ever renders on an
// admin screen - verified: every one of the nine points such a component
// contributes to is read exclusively from app/cactus-admin/**. But the map that
// holds them is ONE flat object, so any consumer of any point statically imports
// every point's implementation, and plenty of consumers sit on the public render
// path (shop's card-media, search's query, core's media reference-rewriters).
//
// The result measured on a live site: a homepage reaching 60 module admin files
// and dragging their client code into its bundle - a 107KB variations panel, a
// 58KB fabric editor, a 44KB abandoned-carts screen - none of which it renders.
//
// So the same entries are emitted twice: the complete map, unchanged, for admin
// surfaces and for any module still importing it; and a public map with the
// admin components left out, for everything on a public path. Splitting by
// directory rather than by a manifest field is deliberate - it needs no module
// to declare anything and cannot silently regress when a new module ships.
//
// One thing the directory rule cannot see: an entry that is not a component at
// all. A conversation provider, a payment provider, a media rewriter - these
// live in the module's lib/, so by the rule above they are "public", and one of
// them dragging imapflow or a telephony SDK into a page's graph is exactly the
// leak this file exists to prevent. So a manifest entry may also say
// `serverOnly: true` and be withheld regardless of where its file sits.
// A THIRD map exists for the gap between those two, and it is not a nicety: a
// SERVER file needing a serverOnly point had nowhere to get it but the complete
// map, and the complete map carries every module's admin screens. That is how a
// homepage came to download 160 admin components - `lib/email/identity.ts` reads
// `core.outbound-email-identity` (serverOnly, so absent from the public map), and
// the homepage reaches it through a members block:
//
//   (public)/page -> renderInfoPage -> config.rsc -> MembersBlocksRsc
//     -> members/admin-link -> members/registration -> email/templates
//     -> email/index -> email/identity -> extension-points  (all 160 of them)
//
// So the server map is "everything except the admin COMPONENTS": serverOnly
// entries are in it, because a server file is exactly where they belong, and
// client admin screens are not, because nothing server-side renders one. Split by
// what an entry IS rather than by where it is read, which is the only rule that
// cannot regress when a module ships a new point.
function isAdminOnly(importPath) {
  return importPath.includes('/components/admin/')
}

// The directory rule above only sees the entry's OWN path, and that is not where
// this leak lives. A provider under the module's lib/ counts as "public" by that
// rule and is emitted into the public map - and then IMPORTS an admin component.
// Measured: `product-3d-views/lib/variant-field-provider.ts` reaches
// `Product3dVariantColumn`, which reaches `Model3dPreviewModal`, which reaches the
// whole 3D viewer, and a public search block reading the public map dragged the lot
// onto a homepage.
//
// So the question is not "where does this entry live" but "can it reach an admin
// screen". Answered by walking its imports, which is cheap here (a few hundred
// files, memoised, build-time only) and cannot regress when a module ships a new
// provider - unlike a manifest flag somebody has to remember to set.
const reachCache = new Map()

function resolveImport(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = join(rootDir, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(fromFile), spec)
  else return null
  for (const ext of ['', '.tsx', '.ts', '/index.tsx', '/index.ts']) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

function fileImports(file) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  const re = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"();]*?\sfrom\s+)?['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const stmt = src.slice(Math.max(0, m.index), m.index + m[0].length)
    if (/\b(?:import|export)\s+type\b/.test(stmt)) continue
    const r = resolveImport(m[1], file)
    if (r) out.push(r)
  }
  const dyn = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dyn.exec(src))) {
    // A dynamic import is a chunk boundary, so it does NOT drag the target into
    // the importer's bundle. Deliberately not followed - that is the very shape a
    // module should use to keep an admin component out of a public graph.
  }
  return out
}

/** Whether this file, or anything it statically imports, lives under components/admin/. */
function reachesAdmin(file, seen = new Set()) {
  if (reachCache.has(file)) return reachCache.get(file)
  if (seen.has(file)) return false
  seen.add(file)
  if (isAdminOnly(file)) { reachCache.set(file, true); return true }
  let hit = false
  for (const next of fileImports(file)) {
    if (reachesAdmin(next, seen)) { hit = true; break }
  }
  reachCache.set(file, hit)
  return hit
}

function entryReachesAdmin(importPath) {
  const file = resolveImport(importPath, join(rootDir, 'lib', 'modules', 'x.ts'))
  return file ? reachesAdmin(file) : false
}

function isServerOnly(entry) {
  return entry.serverOnly === true
}

// Registry-filtered: see scripts/lib/module-names.mjs for why a bare directory
// listing is not good enough here.
function getModuleNames() {
  return registeredModuleNames(rootDir)
}

const moduleNames = getModuleNames()
const imports = []
// ident -> importPath already emitted. A module can contribute the same component
// to two extension points, which yields the same (ident, importPath) twice; emit
// the import once. A collision - the same ident mapping to a DIFFERENT path - is a
// real name clash and must throw rather than emit a duplicate identifier.
const emittedIdents = new Map()
function pushImport(ident, importPath, line) {
  const existing = emittedIdents.get(ident)
  if (existing === undefined) {
    emittedIdents.set(ident, importPath)
    imports.push(line)
  } else if (existing !== importPath) {
    throw new Error(`[generate-module-extension-points] identifier ${ident} maps to two different imports: '${existing}' and '${importPath}'`)
  }
}
// point -> [{ id, ident }]
const byPoint = new Map()

for (const moduleName of moduleNames) {
  const manifestPath = join(modulesDir, moduleName, 'cactus.module.json')
  if (!existsSync(manifestPath)) continue

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    console.warn(`[generate-module-extension-points] Could not parse ${manifestPath} — skipping`)
    continue
  }

  const extensionPoints = manifest.extensionPoints
  if (!Array.isArray(extensionPoints) || extensionPoints.length === 0) continue

  for (const entry of extensionPoints) {
    if (!entry.point || !entry.id || !entry.import || !entry.component) {
      console.warn(`[generate-module-extension-points] Invalid extensionPoints entry in ${moduleName} — skipping`)
      continue
    }

    const importPath = entry.import.replace(/^\.\//, `@/modules/${moduleName}/`)
    const safeModule = moduleName.replace(/-/g, '_')
    const ident = `_${safeModule}_${entry.component}`

    pushImport(ident, importPath, `import { ${entry.component} as ${ident} } from '${importPath}'`)
    if (!byPoint.has(entry.point)) byPoint.set(entry.point, [])
    byPoint.get(entry.point).push({
      id: entry.id,
      ident,
      component: entry.component,
      admin: isAdminOnly(importPath) || isServerOnly(entry) || entryReachesAdmin(importPath),
      importPath,
      moduleName,
      label: typeof entry.label === 'string' ? entry.label : '',
    })
  }
}

const out = []
out.push(`// AUTO-GENERATED by scripts/generate-module-extension-points.mjs`)
out.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
out.push(``)
for (const imp of imports) out.push(imp)
if (imports.length > 0) out.push(``)

out.push(`// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
out.push(`export const moduleExtensionPointComponents: Record<string, Record<string, any>> = {`)
for (const [point, entries] of byPoint) {
  out.push(`  ${JSON.stringify(point)}: {`)
  for (const { id, ident } of entries) out.push(`    ${JSON.stringify(id)}: ${ident},`)
  out.push(`  },`)
}
out.push(`}`)

writeFileSync(outPath, out.join('\n') + '\n')

// ── the public half ────────────────────────────────────────────────────────
// Same map, minus every entry whose component lives under components/admin/ or
// whose manifest entry declares serverOnly.
// A point left with no entries at all is dropped rather than emitted empty: a
// consumer reads `map[point] ?? {}` either way, and an empty object in the file
// would only invite somebody to wonder what happened to it.
const publicImports = []
const publicEmitted = new Set()
const publicByPoint = new Map()
for (const [point, entries] of byPoint) {
  const keep = entries.filter((e) => !e.admin)
  if (keep.length === 0) continue
  publicByPoint.set(point, keep)
  for (const e of keep) {
    if (publicEmitted.has(e.ident)) continue
    publicEmitted.add(e.ident)
    publicImports.push(`import { ${e.component} as ${e.ident} } from '${e.importPath}'`)
  }
}

const pub = []
pub.push(`// AUTO-GENERATED by scripts/generate-module-extension-points.mjs`)
pub.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
pub.push(`//`)
pub.push(`// The same map as extension-points.ts with every components/admin/ entry, and`)
pub.push(`// every entry marked serverOnly in its manifest, left out. Import THIS one from`)
pub.push(`// anything a public page can reach.`)
pub.push(`//`)
pub.push(`// The full map is one flat object, so importing it for a single point pulls in`)
pub.push(`// every module's admin screens - which is how a homepage ended up carrying a`)
pub.push(`// 107KB variations panel it never renders. Every point an admin component`)
pub.push(`// contributes to is read only from app/cactus-admin/**, so nothing on a public`)
pub.push(`// path loses anything by using this map instead.`)
pub.push(``)
for (const imp of publicImports) pub.push(imp)
if (publicImports.length > 0) pub.push(``)
pub.push(`// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
pub.push(`export const modulePublicExtensionPointComponents: Record<string, Record<string, any>> = {`)
for (const [point, entries] of publicByPoint) {
  pub.push(`  ${JSON.stringify(point)}: {`)
  for (const { id, ident } of entries) pub.push(`    ${JSON.stringify(id)}: ${ident},`)
  pub.push(`  },`)
}
pub.push(`}`)
writeFileSync(publicOutPath, pub.join('\n') + '\n')

// ── the server half ────────────────────────────────────────────────────────
// Same map, minus only the entries whose component lives under components/admin/.
// serverOnly entries are KEPT: this map is for server code, which is where they
// are meant to be read. See the note at the top of this file for the leak that
// made a third map necessary.
const serverImports = []
const serverEmitted = new Set()
const serverByPoint = new Map()
for (const [point, entries] of byPoint) {
  const keep = entries.filter((e) => !isAdminOnly(e.importPath) && !entryReachesAdmin(e.importPath))
  if (keep.length === 0) continue
  serverByPoint.set(point, keep)
  for (const e of keep) {
    if (serverEmitted.has(e.ident)) continue
    serverEmitted.add(e.ident)
    serverImports.push(`import { ${e.component} as ${e.ident} } from '${e.importPath}'`)
  }
}

const srv = []
srv.push(`// AUTO-GENERATED by scripts/generate-module-extension-points.mjs`)
srv.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
srv.push(`//`)
srv.push(`// The same map as extension-points.ts with every components/admin/ entry left`)
srv.push(`// out - and, unlike extension-points.public.ts, with the serverOnly entries`)
srv.push(`// KEPT. Import THIS one from server code that needs a serverOnly point.`)
srv.push(`//`)
srv.push(`// Why it exists: the full map is one flat object holding every module's admin`)
srv.push(`// screens, and a server file reading one serverOnly point used to have nowhere`)
srv.push(`// else to get it. lib/email/identity.ts did exactly that, and a members block on`)
srv.push(`// a public page reaches the email stack - so a homepage downloaded 160 admin`)
srv.push(`// components it could never render.`)
srv.push(``)
for (const imp of serverImports) srv.push(imp)
if (serverImports.length > 0) srv.push(``)
srv.push(`// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
srv.push(`export const moduleServerExtensionPointComponents: Record<string, Record<string, any>> = {`)
for (const [point, entries] of serverByPoint) {
  srv.push(`  ${JSON.stringify(point)}: {`)
  for (const { id, ident } of entries) srv.push(`    ${JSON.stringify(id)}: ${ident},`)
  srv.push(`  },`)
}
srv.push(`}`)
writeFileSync(serverOutPath, srv.join('\n') + '\n')

// ── the metadata half ──────────────────────────────────────────────────────
// Point, id, label and owning module for every entry, and not one import.
//
// It exists because a Puck EDITOR field sometimes has to offer "which of the
// installed modules' contributions do you want here?" as a list of choices - the
// Mobile Bar's basket and chat cells, today. The editor cannot read the two maps
// above to build that list: they carry the components themselves, so importing
// either from lib/puck/config.core.tsx would drag every module's public
// components into the bundle of every public page, which is the exact leak the
// public/full split exists to stop. Data only, so it is safe everywhere.
//
// What it lists is a BUILD fact (every module in modules.json was cloned), not
// an installed one. The picker may therefore offer a module this site has not
// installed; the renderer asks the database and simply draws nothing for it.
const meta = []
meta.push(`// AUTO-GENERATED by scripts/generate-module-extension-points.mjs`)
meta.push(`// DO NOT EDIT BY HAND. Rewritten on every build and dev start.`)
meta.push(`//`)
meta.push(`// Metadata for every extension-point entry, with no component imports at all -`)
meta.push(`// safe to import from a client bundle, unlike the two maps beside it.`)
meta.push(``)
meta.push(`export type ModuleExtensionPointEntry = {`)
meta.push(`  point: string`)
meta.push(`  id: string`)
meta.push(`  /** The manifest's own label, or '' when it declared none. */`)
meta.push(`  label: string`)
meta.push(`  moduleName: string`)
meta.push(`  /** Withheld from the public map (admin component, or serverOnly). */`)
meta.push(`  adminOnly: boolean`)
meta.push(`}`)
meta.push(``)
meta.push(`export const moduleExtensionPointEntries: ModuleExtensionPointEntry[] = [`)
for (const [point, entries] of byPoint) {
  for (const e of entries) {
    meta.push(`  { point: ${JSON.stringify(point)}, id: ${JSON.stringify(e.id)}, label: ${JSON.stringify(e.label)}, moduleName: ${JSON.stringify(e.moduleName)}, adminOnly: ${e.admin ? 'true' : 'false'} },`)
  }
}
meta.push(`]`)
meta.push(``)
meta.push(`/** Every public entry contributed to one point, in module order. */`)
meta.push(`export function publicEntriesForPoint(point: string): ModuleExtensionPointEntry[] {`)
meta.push(`  return moduleExtensionPointEntries.filter((e) => e.point === point && !e.adminOnly)`)
meta.push(`}`)
writeFileSync(metaOutPath, meta.join('\n') + '\n')

const pointCount = byPoint.size
const entryCount = imports.length
const withheld = entryCount - publicImports.length
console.log(
  `[generate-module-extension-points] extension-points.ts written (${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} across ${pointCount} point${pointCount === 1 ? '' : 's'}); extension-points.public.ts written (${withheld} server-side entr${withheld === 1 ? 'y' : 'ies'} withheld)`
)
