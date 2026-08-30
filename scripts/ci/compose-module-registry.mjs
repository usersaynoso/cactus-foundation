#!/usr/bin/env node
/**
 * Writes the modules.json a module's build gate should build against.
 *
 * The gate (.github/workflows/module-build-gate.yml) checks the candidate module
 * out into modules/<name> with its git history intact, so checkout-modules.mjs
 * takes its local fast path (`git checkout HEAD -- .`) and the CANDIDATE code is
 * what gets built - not the last released tag.
 *
 * Everything the module declares in requiresModules is added at the version core's
 * own registry pins, because a module that legitimately reaches a sibling's
 * extension point must have that sibling on disk or the build fails for a reason
 * its author cannot act on. Nothing else is added: a gate that assembled every
 * module in the org would be testing the org, not the change, and would fail on
 * somebody else's bad tag.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { planModuleRegistry } from './plan-module-registry.mjs'

const [, , moduleDir] = process.argv
if (!moduleDir) {
  console.error('usage: compose-module-registry.mjs <module-dir>')
  process.exit(1)
}

const manifestPath = join(moduleDir, 'cactus.module.json')
if (!existsSync(manifestPath)) {
  console.error(`[compose-registry] ${manifestPath} not found - is this a Cactus module?`)
  process.exit(1)
}

let registry
try {
  registry = planModuleRegistry({
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    // Copied aside by the workflow before this overwrites modules.json.
    coreRegistry: JSON.parse(readFileSync('modules.json.core', 'utf8')),
    candidateRepoUrl: process.env.CANDIDATE_REPO_URL,
  })
} catch (err) {
  console.error(`[compose-registry] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

writeFileSync('modules.json', JSON.stringify(registry, null, 2) + '\n')
const required = registry.modules.slice(1)
console.log(
  `[compose-registry] building ${registry.modules[0].name} with ` +
  (required.length > 0 ? required.map((e) => `${e.name}@${e.version}`).join(', ') : 'no required modules')
)
