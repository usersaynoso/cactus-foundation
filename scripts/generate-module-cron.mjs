#!/usr/bin/env node
/**
 * Collects `cronJobs` from every installed module's cactus.module.json and emits a
 * gitignored vercel.json at the project root. This is the only way to register Vercel
 * Cron entries without hardcoding a module path into a committed core file - same
 * pattern as generate-module-router.mjs / generate-module-puck.mjs.
 *
 * Vercel Hobby plan caps cron invocations to once per day per cron job.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const modulesDir = join(rootDir, 'modules')
const outPath = join(rootDir, 'vercel.json')

function getModuleNames() {
  if (!existsSync(modulesDir)) return []
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

const crons = []

for (const moduleName of getModuleNames()) {
  const manifestPath = join(modulesDir, moduleName, 'cactus.module.json')
  if (!existsSync(manifestPath)) continue

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    console.warn(`[generate-module-cron] Could not parse ${manifestPath} - skipping`)
    continue
  }

  const cronJobs = manifest.cronJobs
  if (!Array.isArray(cronJobs) || cronJobs.length === 0) continue

  for (const job of cronJobs) {
    if (!job.path || !job.schedule) {
      console.warn(`[generate-module-cron] Invalid cronJobs entry in ${moduleName} - skipping`)
      continue
    }
    crons.push({ path: job.path, schedule: job.schedule })
  }
}

writeFileSync(outPath, JSON.stringify({ crons }, null, 2) + '\n')
console.log(
  `[generate-module-cron] vercel.json written (${crons.length} cron job(s): ${crons.map((c) => c.path).join(', ') || 'none'})`
)
