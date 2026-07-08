// One-off data migration for the Grid component split.
//
// Background
// ----------
// The single dynamic "Grid" Puck block (a Columns select field: 2/3/4, with
// col1..col4 Align/Width/Shrunk-width fields and slots) has been replaced in
// the picker by three fixed-column-count component types: Grid2, Grid3,
// Grid4 - each declaring only the slots it actually has. This was necessary
// because Puck's Outline panel derives its zone list by walking a component
// TYPE's static `fields` declaration (in @puckeditor/core), which completely
// bypasses `resolveFields` - so a single dynamic Grid can never make Outline
// correctly hide an unused col4 zone, no matter how the sidebar form fields
// are trimmed.
//
// The original dynamic `Grid` component stays registered (unchanged, fully
// renderable/editable) purely as a safety net for any pre-existing data this
// migration doesn't reach - it's just no longer listed in any category's
// "Add block" picker. This script rewrites `{ type: 'Grid', props }` nodes to
// `{ type: 'Grid{columns}', props }` (props/data untouched otherwise) so
// existing content gets the correct Outline behaviour without waiting for a
// re-save, and so newly-picked components (Grid2/3/4) are the only kind still
// being created going forward.
//
// Safety
// ------
//   node scripts/migrate-grid-columns-split.mjs            # DRY RUN (default): reads, reports, writes nothing
//   node scripts/migrate-grid-columns-split.mjs --apply     # writes remapped blobs back
//
// Reads DATABASE_URL from .env (falls back to .env.local, then process.env).
// Scope: every Layout row (builderData + publishedData, any type) and every
// InfoPage row (builderData + publishedData), plus SavedBlock rows with
// componentType='Grid'. `history` snapshots on Layout/InfoPage are
// deliberately NOT touched - they still render fine via the legacy `Grid`
// component staying registered, and history is read-only/restore-only so
// there's no picker-consistency reason to touch it.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadDatabaseUrl() {
  for (const file of ['.env', '.env.local']) {
    try {
      const txt = readFileSync(path.join(ROOT, file), 'utf8')
      const line = txt.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
      if (line) {
        let v = line.slice('DATABASE_URL='.length).trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (v) return v
      }
    } catch { /* file may not exist */ }
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  throw new Error('DATABASE_URL not found in .env, .env.local or environment')
}

// Recursively collect every Puck component node ({ type, props }) anywhere in
// a blob - handles content arrays, the zones map, and slot props (col1..col4,
// items, content) uniformly, since a Grid can be nested inside another
// block's slot (including another Grid's column).
function collectComponents(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectComponents(item, out)
    return
  }
  if (node && typeof node === 'object') {
    if (typeof node.type === 'string' && node.props && typeof node.props === 'object') {
      out.push(node)
    }
    for (const value of Object.values(node)) collectComponents(value, out)
  }
}

// Mutates a Grid component's `type` in place; returns a description, or null
// if this isn't a plain Grid node (already migrated / not a Grid at all), or
// a { flag } if `columns` isn't a clean 2/3/4.
function remapGrid(component) {
  if (component.type !== 'Grid') return { changed: false }
  const columns = component.props?.columns
  if (columns !== '2' && columns !== '3' && columns !== '4') {
    return { changed: false, flag: `columns=${JSON.stringify(columns)} is not '2'/'3'/'4' - left as legacy Grid` }
  }
  component.type = `Grid${columns}`
  return { changed: true, description: `Grid -> Grid${columns}` }
}

async function main() {
  const client = new pg.Client({ connectionString: loadDatabaseUrl() })
  await client.connect()

  const report = { layouts: 0, infoPages: 0, savedBlocks: 0, gridsFound: 0, gridsRemapped: 0, flags: [] }
  const writes = [] // { table, id, column, value }
  const backups = [] // { table, id, column, original } - pre-change snapshot, written to disk before any UPDATE on --apply
  const backupPath = process.env.MIGRATION_BACKUP || null

  // --- Layout (every type - headers, footers, pages, module layout types) ---
  const layouts = await client.query(`SELECT id, name, type, "builderData", "publishedData" FROM "Layout"`)
  report.layouts = layouts.rows.length
  for (const row of layouts.rows) {
    for (const column of ['builderData', 'publishedData']) {
      const blob = row[column]
      if (!blob) continue
      const original = JSON.parse(JSON.stringify(blob))
      const components = []
      collectComponents(blob, components)
      let touched = false
      for (const c of components) {
        if (c.type !== 'Grid') continue
        report.gridsFound++
        const { changed, flag } = remapGrid(c)
        if (changed) { touched = true; report.gridsRemapped++ }
        if (flag) report.flags.push(`Layout "${row.name}" [${row.type}] ${row.id} [${column}]: ${flag}`)
      }
      if (touched) { writes.push({ table: 'Layout', id: row.id, column, value: blob }); backups.push({ table: 'Layout', id: row.id, column, original }) }
    }
  }

  // --- InfoPage --------------------------------------------------------------
  const pages = await client.query(`SELECT id, slug, "builderData", "publishedData" FROM "InfoPage"`)
  report.infoPages = pages.rows.length
  for (const row of pages.rows) {
    for (const column of ['builderData', 'publishedData']) {
      const blob = row[column]
      if (!blob) continue
      const original = JSON.parse(JSON.stringify(blob))
      const components = []
      collectComponents(blob, components)
      let touched = false
      for (const c of components) {
        if (c.type !== 'Grid') continue
        report.gridsFound++
        const { changed, flag } = remapGrid(c)
        if (changed) { touched = true; report.gridsRemapped++ }
        if (flag) report.flags.push(`InfoPage "${row.slug}" ${row.id} [${column}]: ${flag}`)
      }
      if (touched) { writes.push({ table: 'InfoPage', id: row.id, column, value: blob }); backups.push({ table: 'InfoPage', id: row.id, column, original }) }
    }
  }

  // --- SavedBlock (componentType='Grid', plus any Grid nested inside a
  //     saved Group/Section/etc block) ---------------------------------------
  const saved = await client.query(`SELECT id, "componentType", data FROM "SavedBlock"`)
  report.savedBlocks = saved.rows.length
  for (const row of saved.rows) {
    const blob = row.data
    if (!blob) continue
    const original = JSON.parse(JSON.stringify(blob))
    const components = []
    collectComponents(blob, components)
    // The saved block's own root node may itself be the Grid (data = { type:
    // 'Grid', props }), or a Grid may be nested inside a saved Group/Section -
    // collectComponents already walks both shapes uniformly.
    let touched = false
    for (const c of components) {
      if (c.type !== 'Grid') continue
      report.gridsFound++
      const { changed, flag } = remapGrid(c)
      if (changed) { touched = true; report.gridsRemapped++ }
      if (flag) report.flags.push(`SavedBlock ${row.id} (${row.componentType}): ${flag}`)
    }
    let componentTypeValue = row.componentType
    if (row.componentType === 'Grid' && blob?.type === 'Grid' && blob.props?.columns) {
      // The row's own componentType column mirrors the root node's type -
      // keep it in sync when the root itself got remapped above.
      componentTypeValue = blob.type
    }
    if (touched) {
      writes.push({ table: 'SavedBlock', id: row.id, column: 'data', value: blob })
      backups.push({ table: 'SavedBlock', id: row.id, column: 'data', original })
      if (componentTypeValue !== row.componentType) {
        writes.push({ table: 'SavedBlock', id: row.id, column: 'componentType', value: componentTypeValue })
        backups.push({ table: 'SavedBlock', id: row.id, column: 'componentType', original: row.componentType })
      }
    }
  }

  // --- Report -----------------------------------------------------------------
  console.log('\n=== Grid component split migration ===')
  console.log(`Mode:                 ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`)
  console.log(`Layouts scanned:      ${report.layouts}`)
  console.log(`InfoPages scanned:    ${report.infoPages}`)
  console.log(`SavedBlocks scanned:  ${report.savedBlocks}`)
  console.log(`Grid nodes found:     ${report.gridsFound}`)
  console.log(`  remapped cleanly:   ${report.gridsRemapped}`)
  console.log(`  blobs to rewrite:   ${writes.length}`)
  if (report.flags.length) {
    console.log('\n--- Grid nodes NOT remapped (need a human look) ---')
    for (const f of report.flags) console.log(`  ! ${f}`)
  } else if (report.gridsFound) {
    console.log('\nAll Grid nodes had a clean columns value (2/3/4).')
  }

  if (APPLY) {
    if (backupPath && backups.length) {
      writeFileSync(backupPath, JSON.stringify(backups, null, 2))
      console.log(`\nWrote pre-change backup of ${backups.length} row(s) to ${backupPath}`)
    }
    for (const w of writes) {
      await client.query(`UPDATE "${w.table}" SET "${w.column}" = $1 WHERE id = $2`, [w.value, w.id])
    }
    console.log(`Applied ${writes.length} write(s).`)
  } else if (writes.length) {
    console.log(`\nDry run: ${writes.length} blob(s)/column(s) WOULD be rewritten. Re-run with --apply to persist.`)
  }

  await client.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
