// One-off data migration + audit for the SiteLogo "Element height" rename and
// the header true-centering fix.
//
// Background
// ----------
// The SiteLogo Puck block's height fields were renamed:
//   logoHeight        -> cellHeight        ("Element height")
//   logoHeightShrunk  -> cellHeightShrunk  ("Element height when shrunk")
// The render paths (SiteLogoClient + SiteLogoRsc) still fall back to the old
// keys, so un-migrated data keeps rendering correctly - this script is a
// cleanup that rewrites saved blobs to the new key names, not a correctness
// prerequisite.
//
// The same tree walk also reports, read-only, the real-world usage that the
// header true-centering fix (Grid column align='center', Group 3-item
// space-distributed layouts) will start affecting, so a human can eyeball
// whether any specific saved header will visibly shift on deploy.
//
// Safety
// ------
//   node scripts/migrate-sitelogo-cell-height.mjs            # DRY RUN (default): reads, reports, writes nothing
//   node scripts/migrate-sitelogo-cell-height.mjs --apply    # writes remapped blobs back (NOT run as part of this task)
//
// Reads DATABASE_URL from .env (falls back to .env.local, then process.env).
// Scope: Layout rows with type='header' (builderData + publishedData) and
// SavedBlock rows with componentType in SiteLogo/Grid/Group.

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

// Recursively collect every Puck component node ({ type, props }) anywhere in a
// blob - handles content arrays, the zones map, and slot props (col1..col4,
// items, content) uniformly, since a SiteLogo/Grid/Group can be nested inside
// another block's slot.
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

// Mutates a SiteLogo component's props in place; returns a description of the
// change, or a { flag } describing why the mapping isn't a clean 1:1.
function remapSiteLogo(props) {
  const changes = []
  const flags = []
  for (const [oldKey, newKey] of [['logoHeight', 'cellHeight'], ['logoHeightShrunk', 'cellHeightShrunk']]) {
    const hasOld = Object.prototype.hasOwnProperty.call(props, oldKey)
    const hasNew = Object.prototype.hasOwnProperty.call(props, newKey)
    if (!hasOld) continue
    const oldVal = props[oldKey]
    if (hasNew && props[newKey] !== oldVal) {
      flags.push(`${oldKey}=${JSON.stringify(oldVal)} but ${newKey} already set to ${JSON.stringify(props[newKey])} - not overwriting`)
      continue
    }
    if (oldVal !== undefined && oldVal !== null && typeof oldVal !== 'number') {
      flags.push(`${oldKey}=${JSON.stringify(oldVal)} is not a number`)
    }
    props[newKey] = oldVal
    delete props[oldKey]
    changes.push(`${oldKey} -> ${newKey} (${JSON.stringify(oldVal)})`)
  }
  return { changes, flags }
}

function summariseCentering(components, bucket, source) {
  for (const c of components) {
    if (c.type === 'Grid') {
      const colCount = parseInt(c.props.columns ?? '2', 10)
      const centres = []
      for (let i = 0; i < colCount; i++) {
        if (c.props[`col${i + 1}Align`] === 'center') { bucket.gridCenterCols++; centres.push(i + 1) }
      }
      if (centres.length) {
        bucket.gridsWithCenter++
        bucket.details.push(`${source}: Grid (${colCount}-col) centre column(s) ${centres.join(', ')}`)
      }
    } else if (c.type === 'Group') {
      const justify = c.props.justify
      if (justify === 'between' || justify === 'around' || justify === 'evenly') {
        const items = Array.isArray(c.props.items) ? c.props.items : []
        bucket.groupsSpaced++
        if (items.length === 3) {
          bucket.groupsSpacedThree++
          bucket.details.push(`${source}: Group justify=${justify} with exactly 3 items - middle item will be header-centred`)
        }
      }
    }
  }
}

async function main() {
  const client = new pg.Client({ connectionString: loadDatabaseUrl() })
  await client.connect()

  const report = {
    layouts: 0, savedBlocks: 0,
    siteLogos: 0, siteLogosRemapped: 0, siteLogoFlags: [],
    centering: { gridsWithCenter: 0, gridCenterCols: 0, groupsSpaced: 0, groupsSpacedThree: 0, details: [] },
  }
  const writes = [] // { table, id, column, value }
  const backups = [] // { table, id, column, original } - pre-change snapshot, written to disk before any UPDATE on --apply
  const backupPath = process.env.MIGRATION_BACKUP || null

  // --- Layout (type='header') -------------------------------------------------
  const layouts = await client.query(
    `SELECT id, name, type, "builderData", "publishedData" FROM "Layout" WHERE type = 'header'`
  )
  report.layouts = layouts.rows.length
  for (const row of layouts.rows) {
    for (const column of ['builderData', 'publishedData']) {
      const blob = row[column]
      if (!blob) continue
      const original = JSON.parse(JSON.stringify(blob)) // snapshot before in-place remap
      const components = []
      collectComponents(blob, components)
      summariseCentering(components, report.centering, `Layout "${row.name}" [${column}]`)
      let touched = false
      for (const c of components) {
        if (c.type !== 'SiteLogo') continue
        report.siteLogos++
        const { changes, flags } = remapSiteLogo(c.props)
        if (changes.length) { touched = true; report.siteLogosRemapped++ }
        for (const f of flags) report.siteLogoFlags.push(`Layout ${row.id} (${row.name}) [${column}]: ${f}`)
      }
      if (touched) { writes.push({ table: 'Layout', id: row.id, column, value: blob }); backups.push({ table: 'Layout', id: row.id, column, original }) }
    }
  }

  // --- SavedBlock (componentType in SiteLogo/Grid/Group) ----------------------
  const saved = await client.query(
    `SELECT id, "componentType", data FROM "SavedBlock" WHERE "componentType" IN ('SiteLogo','Grid','Group')`
  )
  report.savedBlocks = saved.rows.length
  for (const row of saved.rows) {
    const blob = row.data
    if (!blob) continue
    const original = JSON.parse(JSON.stringify(blob)) // snapshot before in-place remap
    const components = []
    collectComponents(blob, components)
    summariseCentering(components, report.centering, `SavedBlock ${row.id} (${row.componentType})`)
    let touched = false
    for (const c of components) {
      if (c.type !== 'SiteLogo') continue
      report.siteLogos++
      const { changes, flags } = remapSiteLogo(c.props)
      if (changes.length) { touched = true; report.siteLogosRemapped++ }
      for (const f of flags) report.siteLogoFlags.push(`SavedBlock ${row.id} (${row.componentType}): ${f}`)
    }
    if (touched) { writes.push({ table: 'SavedBlock', id: row.id, column: 'data', value: blob }); backups.push({ table: 'SavedBlock', id: row.id, column: 'data', original }) }
  }

  // --- Report -----------------------------------------------------------------
  console.log('\n=== SiteLogo cell-height migration / header centering audit ===')
  console.log(`Mode:                 ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`)
  console.log(`Header layouts:       ${report.layouts}`)
  console.log(`SavedBlocks scanned:  ${report.savedBlocks} (SiteLogo/Grid/Group)`)
  console.log(`SiteLogo blocks:      ${report.siteLogos}`)
  console.log(`  needing remap:      ${report.siteLogosRemapped}`)
  console.log(`  blobs to rewrite:   ${writes.length}`)
  console.log('\n--- Part 1 pre-flight: header true-centering coverage ---')
  console.log(`Grids with a centre-aligned column: ${report.centering.gridsWithCenter} (${report.centering.gridCenterCols} centre columns total)`)
  console.log(`Groups space-distributed (between/around/evenly): ${report.centering.groupsSpaced}`)
  console.log(`  of which exactly 3 items (the ones the fix moves): ${report.centering.groupsSpacedThree}`)
  console.log('  (counts span both draft [builderData] and published [publishedData] blobs, so an edited+published header is listed twice)')
  if (report.centering.details.length) {
    console.log('  affected blocks:')
    for (const d of report.centering.details) console.log(`    - ${d}`)
  }
  if (report.siteLogoFlags.length) {
    console.log('\n--- Mappings that are NOT a clean 1:1 (need a human look) ---')
    for (const f of report.siteLogoFlags) console.log(`  ! ${f}`)
  } else {
    console.log('\nAll SiteLogo height mappings are a clean 1:1.')
  }

  if (APPLY) {
    if (backupPath && backups.length) {
      writeFileSync(backupPath, JSON.stringify(backups, null, 2))
      console.log(`\nWrote pre-change backup of ${backups.length} row(s) to ${backupPath}`)
    }
    for (const w of writes) {
      await client.query(`UPDATE "${w.table}" SET "${w.column}" = $1 WHERE id = $2`, [w.value, w.id])
    }
    console.log(`Applied ${writes.length} blob rewrite(s).`)
  } else if (writes.length) {
    console.log(`\nDry run: ${writes.length} blob(s) WOULD be rewritten. Re-run with --apply to persist.`)
  }

  await client.end()
}

main().catch((err) => { console.error(err); process.exit(1) })
