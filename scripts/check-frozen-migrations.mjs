#!/usr/bin/env node
/**
 * A module migration that has been released is frozen. This finds the ones that
 * were not.
 *
 * `scripts/run-module-migrations.mjs` records applied files in `ModuleMigration`
 * keyed by NAME, never by content, so a file that has run once never runs again
 * on that install however much it changes afterwards. Editing a released
 * migration therefore does not "update" anything - it silently produces two
 * populations of install: the ones provisioned before the edit, which will never
 * see it, and the ones provisioned after, which get it as part of the original
 * file. Every fresh install and every local database looks correct, so nothing a
 * developer can run says a word about it.
 *
 * This is not hypothetical. On 2026-09-08 shop's 043_returnable.sql was released
 * as v0.1.401 with three column adds, applied to the live site nine minutes
 * later, and then edited to add a fourth. The edit shipped in v0.1.402. The site
 * had 043 on its applied list, so it never ran again, and the checkout - which by
 * then INSERTed that fourth column onto every order line - failed outright on the
 * next order placed. A customer's card was charged and no order existed. It was
 * the second real order the shop had taken.
 *
 * The rule this enforces, in one line: once a migration has been in a release,
 * its bytes never change again. Something missing goes in a NEW numbered file.
 *
 * `001_initial.sql` is deliberately exempt. It only ever runs on a fresh install,
 * and project policy is that it is edited in place so a new install lands in the
 * same place as an updated one. A change there can reach nobody by surprise.
 *
 * Usage:
 *   node scripts/check-frozen-migrations.mjs          # human output, exit 1 on any violation
 *   node scripts/check-frozen-migrations.mjs --json   # machine output
 *
 * Also imported by scripts/check-frozen-migrations.test.ts, which is how it runs
 * in plain `npm test` - on the commit that makes the edit, not weeks later on
 * somebody's customer.
 */

import { execFileSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(__dirname, '..')

// Edited in place by design - see the header. Anything else is frozen.
const EXEMPT_FILENAMES = new Set(['001_initial.sql'])

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * The newest release tag in a module checkout, or null when it has never been
 * released. Version-sorted rather than by date: a tag pushed out of order still
 * has to compare as the version it names.
 */
function newestTag(dir) {
  try {
    const out = git(dir, ['tag', '--list', 'v*', '--sort=-v:refname']).trim()
    if (!out) return null
    return out.split('\n')[0].trim() || null
  } catch {
    return null
  }
}

/** path -> blob sha for every migration in a tag's tree. */
function migrationBlobsAtTag(dir, tag) {
  const blobs = new Map()
  let out
  try {
    out = git(dir, ['ls-tree', '-r', tag, '--', 'migrations'])
  } catch {
    return blobs
  }
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    // "<mode> <type> <sha>\t<path>"
    const [meta, filePath] = line.split('\t')
    if (!filePath) continue
    const parts = meta.trim().split(/\s+/)
    const sha = parts[2]
    if (parts[1] !== 'blob' || !sha) continue
    blobs.set(filePath.trim(), sha)
  }
  return blobs
}

/**
 * The sha git WOULD record for the file as it sits on disk right now. Compared
 * against the blob in the tag, this is an exact content comparison that costs
 * nothing to explain: same sha, same bytes.
 */
function worktreeBlobSha(dir, relPath) {
  try {
    return git(dir, ['hash-object', '--', relPath]).trim()
  } catch {
    return null
  }
}

function moduleDirectories(root) {
  const modulesDir = path.join(root, 'modules')
  if (!existsSync(modulesDir)) return []
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, dir: path.join(modulesDir, e.name) }))
    .filter((m) => existsSync(path.join(m.dir, '.git')))
    .filter((m) => existsSync(path.join(m.dir, 'migrations')))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Every released migration whose bytes have since changed.
 *
 * `skipped` is not padding: a module with no tags, or one that is not checked out
 * at all, genuinely cannot be judged, and a caller that reports "0 violations"
 * over a tree where nothing was inspected would be worse than saying nothing.
 */
export function findFrozenMigrationViolations({ root = REPO_ROOT } = {}) {
  const violations = []
  const skipped = []
  const checked = []

  for (const mod of moduleDirectories(root)) {
    const tag = newestTag(mod.dir)
    if (!tag) {
      skipped.push({ module: mod.name, reason: 'no release tags' })
      continue
    }

    const released = migrationBlobsAtTag(mod.dir, tag)
    if (released.size === 0) {
      skipped.push({ module: mod.name, reason: `no migrations in ${tag}` })
      continue
    }

    let filenames
    try {
      filenames = readdirSync(path.join(mod.dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    } catch {
      skipped.push({ module: mod.name, reason: 'migrations unreadable' })
      continue
    }

    let inspected = 0
    for (const filename of filenames) {
      if (EXEMPT_FILENAMES.has(filename)) continue
      const relPath = `migrations/${filename}`
      const releasedSha = released.get(relPath)
      // Absent from the tag: a new migration that has not been released yet,
      // which is exactly what a schema change is supposed to look like.
      if (!releasedSha) continue
      inspected++
      const currentSha = worktreeBlobSha(mod.dir, relPath)
      if (!currentSha || currentSha === releasedSha) continue
      violations.push({ module: mod.name, file: relPath, tag, releasedSha, currentSha })
    }
    checked.push({ module: mod.name, tag, inspected })
  }

  return { violations, skipped, checked }
}

function main() {
  const asJson = process.argv.includes('--json')
  const result = findFrozenMigrationViolations()

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.violations.length === 0 ? 0 : 1)
  }

  if (result.violations.length === 0) {
    const files = result.checked.reduce((n, c) => n + c.inspected, 0)
    console.log(
      `[frozen-migrations] OK - ${files} released migration(s) unchanged across ${result.checked.length} module(s)` +
        (result.skipped.length ? `, ${result.skipped.length} not checked` : '')
    )
    process.exit(0)
  }

  console.error('[frozen-migrations] RELEASED MIGRATIONS HAVE BEEN EDITED\n')
  for (const v of result.violations) {
    console.error(`  ${v.module}/${v.file}`)
    console.error(`     released in ${v.tag} as ${v.releasedSha.slice(0, 12)}, on disk now ${v.currentSha.slice(0, 12)}`)
  }
  console.error(
    '\n  An install that already ran one of these will NEVER run it again - the applied' +
      '\n  list is keyed by name, not content. Put the missing statements in a NEW numbered' +
      '\n  file in the same folder and restore these to what the tag holds:' +
      '\n'
  )
  for (const v of result.violations) {
    console.error(`     git -C modules/${v.module} checkout ${v.tag} -- ${v.file}`)
  }
  process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
