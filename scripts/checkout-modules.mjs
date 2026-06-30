#!/usr/bin/env node
/**
 * Ensures all git submodule working trees have their files populated.
 *
 * Vercel clones submodules with a blobless partial clone — tree objects (directories)
 * are present but blob objects (file contents) are not fetched until accessed.
 * readdirSync shows the directories but not the files, so the router generator
 * finds 0 pages. This script forces git to materialise the blobs before the
 * generator runs.
 */

import { readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modulesDir = join(rootDir, 'modules')

if (!existsSync(modulesDir)) {
  console.log('[checkout-modules] No modules/ directory — nothing to do.')
  process.exit(0)
}

const moduleNames = readdirSync(modulesDir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)

if (moduleNames.length === 0) {
  console.log('[checkout-modules] No module directories found.')
  process.exit(0)
}

for (const name of moduleNames) {
  const moduleDir = join(modulesDir, name)
  console.log(`[checkout-modules] Checking out ${name}…`)
  const result = spawnSync(
    'git',
    ['-C', moduleDir, 'checkout', 'HEAD', '--', '.'],
    { stdio: 'inherit', shell: false }
  )
  if (result.status !== 0) {
    console.warn(`[checkout-modules] git checkout failed for ${name} (status ${result.status}) — continuing`)
  } else {
    console.log(`[checkout-modules] ${name}: done`)
  }
}
