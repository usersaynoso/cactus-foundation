import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { INSTALLED_MODULE_STATUSES } from '@/lib/modules/live-status'

// Why this test exists.
//
// Filtering modules on `status: { in: ['active', 'update_available'] }` looks
// obviously right and is obviously wrong: a module being UPDATED sits in
// `deploying` (then `pending_deploy`) with its code still live in the running
// build, so that filter treats it as uninstalled and every feature it contributes
// silently disappears from the public site for the length of the deploy - or
// indefinitely, if the deploy is deferred. It took a "3D models vanish when we
// redeploy" report to notice, because nothing throws: the page just renders
// without the module's contribution.
//
// The filter had been copied to 20-odd call sites by hand. tsc and eslint have
// nothing to say about any of them, so this is the only thing standing between a
// future copy-paste and the same invisible outage.

const ROOT = join(__dirname, '..', '..')
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel', 'wiki'])
const RAW_FILTER = /status:\s*\{\s*in:\s*\[\s*'active',\s*'update_available'\s*\]/

// The one legitimate holdout: the update checker must exclude in-flight deploys or
// it re-offers the update already running. It carries a comment saying so.
const ALLOWED = new Set(['lib/modules/updates.ts'])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

describe('installed-module status filter', () => {
  it('treats a module mid-deploy as still installed', () => {
    // Both are states an ALREADY-LIVE module passes through during an update.
    expect(INSTALLED_MODULE_STATUSES).toContain('deploying')
    expect(INSTALLED_MODULE_STATUSES).toContain('pending_deploy')
    expect(INSTALLED_MODULE_STATUSES).toContain('active')
    expect(INSTALLED_MODULE_STATUSES).toContain('update_available')
  })

  it('excludes states that mean the module is not installed here', () => {
    expect(INSTALLED_MODULE_STATUSES).not.toContain('inactive')
    expect(INSTALLED_MODULE_STATUSES).not.toContain('failed')
    expect(INSTALLED_MODULE_STATUSES).not.toContain('pending_install')
  })

  it('is the only module status filter in the codebase', () => {
    const offenders = walk(ROOT)
      .filter((f) => RAW_FILTER.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f) && !f.endsWith('live-status.test.ts'))

    expect(
      offenders,
      `These hand-rolled module status filters drop a module mid-deploy, so whatever ` +
        `they gate vanishes from the site during an update. Use INSTALLED_MODULE_WHERE ` +
        `from lib/modules/live-status.ts instead:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })
})
