import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { allStarterTemplates, ENTIRE_SITE_CONDITIONS, type StarterTemplate } from '@/lib/layout/starter-templates'
import pkg from '@/package.json'

// Starter layouts are in-code templates (lib/layout/starter-templates.ts), not
// database rows. The site owner picks one when creating a layout and gets a
// plain, editable copy. Nothing in this file ever writes a read-only row.
//
// Two jobs live here:
//
//   seedDefaultLayouts()  - install time only. A fresh site needs a working
//                           header, footer, page shell, 404 and status screens
//                           on day one, so each `publishByDefault` template is
//                           seeded once as an ordinary editable Layout.
//
//   ensureLayoutsCurrent() - update time only. Clears out the rows the old
//                           read-only-starter scheme left behind. Never creates
//                           anything: an existing site already has its layouts,
//                           and seeding a second site-wide header into it would
//                           be a good way to change its design without asking.

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
}

function hasNoDisplayConditions(row: LayoutRow): boolean {
  const conditions = row.displayConditions as { include?: unknown[] } | null
  return !conditions?.include?.length
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
 * This returns the ids that are provably safe to delete: a copy of a known
 * template, that has never been given a display condition (so it renders
 * nowhere), whose content is still byte-for-byte the template it was stamped
 * from (so the owner has never edited it). Anything the owner touched, gave a
 * condition to, or built themselves fails one of those three and survives - to
 * be deleted by hand if they want it gone.
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
      return stableStringify(row.builderData) === expected
    })
    .map((row) => row.id)
}

// ---------------------------------------------------------------------------
// seedDefaultLayouts - fresh install only
// ---------------------------------------------------------------------------

/**
 * Seeds the layouts a brand new site goes live with: the default header and
 * footer, the full-width page shell, the 404, and the coming-soon/maintenance
 * screens, plus any module template flagged `publishByDefault` (Shop's pages
 * are Puck-only, with no hardcoded fallback to fall back on).
 *
 * Each one is an ordinary editable Layout, not a template - the site owner can
 * rewrite or delete it like any other. Ids stay `<template-id>-live` because
 * that is where existing installs' live layouts already live; renaming them
 * would seed those sites a second header on their next deploy.
 *
 * Create-only: an existing row is never overwritten, so re-running this (a
 * database reset, a re-run setup) never stamps on the owner's work.
 */
export async function seedDefaultLayouts(db: typeof prisma) {
  for (const { type, template } of allStarterTemplates()) {
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
 * builderData - survives the column being dropped.
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
    select: { id: true, displayConditions: true, builderData: true },
  })
  const stale = planStarterCleanup(rows, allStarterTemplates())
  if (stale.length) {
    await db.layout.deleteMany({ where: { id: { in: stale } } })
  }
}
