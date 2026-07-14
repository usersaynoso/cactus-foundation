import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import {
  allStarterTemplates,
  coreStarterTemplates,
  moduleStarterTemplates,
  ENTIRE_SITE_CONDITIONS,
  type StarterTemplate,
} from '@/lib/layout/starter-templates'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import pkg from '@/package.json'

// Starter layouts are in-code templates (lib/layout/starter-templates.ts), not
// database rows. The site owner picks one when creating a layout and gets a
// plain, editable copy. Nothing in this file ever writes a read-only row.
//
// Four jobs live here:
//
//   seedDefaultLayouts()   - setup time only. A fresh site needs a working
//                            header, footer, page shell, 404 and status screens
//                            on day one, so each core `publishByDefault` template
//                            is seeded once as an ordinary editable Layout.
//                            CORE ONLY: at setup no module is installed, and this
//                            used to walk the module templates too - which is how
//                            sites with no Shop ended up with Shop layouts.
//
//   seedModuleDefaultLayouts() - install time for one module, called once its
//                            deploy lands (lib/deploy/reconcile.ts). A module's
//                            code only reaches the build after that deploy, so
//                            this is the first moment its templates exist at all.
//
//   pruneUninstalledModuleLayouts() - removes layouts belonging to a module this
//                            site does not have. Cleans up after the old seeder,
//                            and after an uninstall.
//
//   ensureLayoutsCurrent() - update time only. Runs the prune and clears out the
//                            rows the old read-only-starter scheme left behind.
//                            Never creates anything: an existing site already has
//                            its layouts, and seeding a second site-wide header
//                            into it would be a good way to change its design
//                            without asking.

// ---------------------------------------------------------------------------
// Cleanup planner (pure - see starterLayouts.test.ts)
// ---------------------------------------------------------------------------

/** JSON with object keys sorted, so a jsonb round-trip through Postgres (which
 * does not preserve key order) still compares equal to the in-code template. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export type LayoutRow = {
  id: string
  builderData: unknown
  displayConditions: unknown
  createdAt?: Date
  updatedAt?: Date
  publishedAt?: Date | null
}

function hasNoDisplayConditions(row: LayoutRow): boolean {
  const conditions = row.displayConditions as { include?: unknown[] } | null
  return !conditions?.include?.length
}

/**
 * A row nobody has ever saved. The copies were minted by the server mid-deploy,
 * so `updatedAt` still sitting on `createdAt` means no human has opened this one
 * and pressed anything: every edit and every publish goes through an update that
 * moves it. The few seconds of slack absorb the gap between the row's database
 * default `createdAt` and the `updatedAt` the client stamps on it; no owner can
 * have opened, changed and saved a layout inside five seconds of a deploy
 * conjuring it.
 */
const UNTOUCHED_WINDOW_MS = 5_000

function neverSaved(row: LayoutRow): boolean {
  if (!row.createdAt || !row.updatedAt) return false
  if (row.publishedAt) return false
  return Math.abs(row.updatedAt.getTime() - row.createdAt.getTime()) < UNTOUCHED_WINDOW_MS
}

/**
 * The old scheme seeded every starter as a read-only row, and its migration
 * branch keyed off `status === 'published'` - which every starter row also was.
 * So on each core update it minted a `<id>-live` copy of all of them (not just
 * the handful a fresh install goes live with), and older versions minted
 * `<id>-edited` copies too. A site that has taken a few updates is sitting on
 * dozens of published-but-condition-less layouts that render nowhere and exist
 * only to clutter the Layouts list.
 *
 * This returns the ids that are provably safe to delete. A row has to clear all
 * of:
 *
 *   1. The id is `<known-template-id>-live` or `-edited`. Only the old seeder
 *      ever minted those; every layout an owner makes (including Duplicate) gets
 *      a cuid, so this can never match something they built.
 *   2. It has no display conditions, so it renders nowhere and deleting it
 *      cannot change what the site looks like.
 *   3. The owner has never touched it - proven EITHER by the row never having
 *      been saved (see `neverSaved`), OR by its content still being byte-for-byte
 *      the template it was stamped from.
 *
 * Two proofs for (3) because either alone leaks. Content equality alone misses
 * copies stamped from an older vintage of the same template: block props get
 * renamed over time (`logoHeight` -> `cellHeight`, and so on), so a years-old
 * copy no longer matches today's catalogue and would survive forever despite
 * nobody ever having opened it. Timestamps alone would miss a row whose
 * `updatedAt` was nudged by some unrelated write. A row that fails both was
 * genuinely worked on, and survives - to be deleted by hand if they want it gone.
 */
export function planStarterCleanup(
  rows: LayoutRow[],
  templates: Array<{ type: string; template: StarterTemplate }>,
): string[] {
  const canonical = new Map<string, string>()
  for (const { template } of templates) {
    const json = stableStringify(template.data)
    canonical.set(`${template.id}-live`, json)
    canonical.set(`${template.id}-edited`, json)
  }

  return rows
    .filter((row) => {
      const expected = canonical.get(row.id)
      if (expected === undefined) return false
      if (!hasNoDisplayConditions(row)) return false
      if (neverSaved(row)) return true
      return stableStringify(row.builderData) === expected
    })
    .map((row) => row.id)
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Stamps each `publishByDefault` template in the given set as an ordinary editable
 * Layout. Not a template - the site owner can rewrite or delete it like any other.
 * Ids stay `<template-id>-live` because that is where existing installs' live
 * layouts already live; renaming them would seed those sites a second header on
 * their next deploy.
 *
 * Create-only: an existing row is never overwritten, so re-running this (a database
 * reset, a re-run setup) never stamps on the owner's work.
 */
async function seedTemplates(
  db: typeof prisma,
  templates: Array<{ type: string; template: StarterTemplate }>,
) {
  for (const { type, template } of templates) {
    if (!template.publishByDefault) continue
    const id = `${template.id}-live`
    await db.layout.upsert({
      where: { id },
      create: {
        id,
        name: template.name,
        type,
        description: template.description,
        status: 'published',
        displayConditions: template.defaultConditions ?? ENTIRE_SITE_CONDITIONS,
        builderData: template.data as unknown as Prisma.InputJsonObject,
      },
      update: {},
    })
  }
}

/**
 * Seeds the layouts a brand new site goes live with: the default header and
 * footer, the full-width page shell, the 404, and the coming-soon/maintenance
 * screens.
 *
 * Core templates only. This used to walk every module's templates as well, which
 * made no sense at the one moment it runs: setup completes with zero modules
 * installed, so it was writing Shop cart/checkout/product layouts into sites that
 * had no Shop and never would. A module's own defaults are seeded when the module
 * arrives - see seedModuleDefaultLayouts().
 */
export async function seedDefaultLayouts(db: typeof prisma) {
  await seedTemplates(db, coreStarterTemplates())
}

/**
 * Seeds one module's `publishByDefault` layouts, once, when its install deploy
 * lands (lib/deploy/reconcile.ts). A module's pages can be Puck-only with no
 * hardcoded fallback - the Shop's are - so it needs these rows to render anything
 * at all, and it cannot have them any earlier: its code only reaches the build
 * with that deploy, so until then its templates do not exist to copy.
 *
 * Guarded by Module.layoutsSeededAt, not by the upsert alone. A module *update*
 * redeploys down this same path, and a create-only upsert would happily re-mint a
 * layout the owner had deleted in the meantime.
 */
export async function seedModuleDefaultLayouts(db: typeof prisma, moduleName: string) {
  await seedTemplates(db, moduleStarterTemplates(moduleName))
}

// ---------------------------------------------------------------------------
// ensureLayoutsCurrent - update time only
// ---------------------------------------------------------------------------

/**
 * Prunes the `<id>-live`/`<id>-edited` copies the old read-only-starter scheme
 * spawned. Runs once per core version: SiteConfig.starterTemplatesVersion
 * records the version that last ran it, and the first request after a deploy
 * with a different version re-runs it. The module-level flag keeps that to one
 * SiteConfig query per warm server instance; a failed or raced run leaves the
 * stamp unwritten so a later request retries (every write here is idempotent).
 *
 * The starter rows themselves are NOT deleted here - `prisma/core-reconcile/
 * 005_retire_starter_layouts.sql` does that at build time, immediately before
 * it drops the `isStarter` column. It has to be that way round: the column is
 * gone by the time this runs, so a `where: { isStarter: true }` here would
 * throw, get swallowed by the catch below, and leave the stamp unwritten
 * forever. Everything this function keys on - row id, display conditions,
 * builderData, timestamps - survives the column being dropped.
 */
let layoutsEnsured = false

export async function ensureLayoutsCurrent() {
  if (layoutsEnsured) return
  try {
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { setupCompleted: true, starterTemplatesVersion: true },
    })
    if (!cfg?.setupCompleted) return
    if (cfg.starterTemplatesVersion !== pkg.version) {
      await pruneLegacyStarterCopies(prisma)
      await pruneUninstalledModuleLayouts(prisma)
      await prisma.siteConfig.update({
        where: { id: 'singleton' },
        data: { starterTemplatesVersion: pkg.version },
      })
    }
    layoutsEnsured = true
  } catch {
    // Never let this break a page render; retried on a later request.
  }
}

export async function pruneLegacyStarterCopies(db: typeof prisma) {
  const rows = await db.layout.findMany({
    select: {
      id: true, displayConditions: true, builderData: true,
      createdAt: true, updatedAt: true, publishedAt: true,
    },
  })
  const stale = planStarterCleanup(rows, allStarterTemplates())
  if (stale.length) {
    await db.layout.deleteMany({ where: { id: { in: stale } } })
  }
}

// ---------------------------------------------------------------------------
// pruneUninstalledModuleLayouts
// ---------------------------------------------------------------------------

/**
 * Deletes the layouts belonging to a module this site does not have.
 *
 * These exist for two reasons. Mostly the old seeder: it stamped every module's
 * `publishByDefault` template at setup, when nothing is installed, so a site that
 * never touched the Shop still got its cart, checkout, product and confirmation
 * layouts. And after an uninstall, the module's layouts are core Layout rows - the
 * teardown only drops the module's own tables, so they outlive it.
 *
 * "Does not have" is deliberately strict: no Module row AND no ModuleMigration
 * rows. A code_only uninstall keeps the module's tables and its migration history
 * precisely so a reinstall picks the data back up, and quietly binning the owner's
 * layouts would make a liar of it. A code_and_data uninstall clears both, and a
 * module that was never installed has neither.
 *
 * Types that no longer map to any module in the build (the module has been gone
 * long enough that the build no longer clones it) are left alone: there is nothing
 * to check them against, and a module whose checkout merely failed this once must
 * not cost the owner their layouts.
 */
export function planOrphanLayoutTypes(
  typeToModule: Record<string, { moduleName: string }>,
  presentModules: Set<string>,
): string[] {
  return Object.entries(typeToModule)
    .filter(([, group]) => !presentModules.has(group.moduleName))
    .map(([type]) => type)
}

export async function pruneUninstalledModuleLayouts(db: typeof prisma): Promise<number> {
  const [modules, migrations] = await Promise.all([
    db.module.findMany({ select: { name: true } }),
    db.moduleMigration.findMany({ select: { moduleName: true }, distinct: ['moduleName'] }),
  ])
  const present = new Set([
    ...modules.map((m) => m.name),
    ...migrations.map((m) => m.moduleName),
  ])

  const orphanTypes = planOrphanLayoutTypes(moduleLayoutTypeToGroup, present)
  if (orphanTypes.length === 0) return 0

  const { count } = await db.layout.deleteMany({ where: { type: { in: orphanTypes } } })
  return count
}
