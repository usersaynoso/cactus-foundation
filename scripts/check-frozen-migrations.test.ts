// The guard that would have stopped 2026-09-08: shop's 043_returnable.sql was
// released, applied to the live site, and then edited. See the script's header
// for the whole story.
//
// Two halves, and both matter. The fixture half proves the detector actually
// detects - a "0 violations" that would say 0 whatever you did to the tree is
// worse than no check at all. The live half is the regression guard: it runs
// over this repo's real module checkouts on every `npm test`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { findFrozenMigrationViolations } from './check-frozen-migrations.mjs'

const RELEASED = '-- released\nALTER TABLE "x" ADD COLUMN IF NOT EXISTS "a" TEXT;\n'

function git(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** A throwaway tree shaped like this repo: <root>/modules/<name>, each its own repo. */
function makeFixtureModule(root: string, name: string, files: Record<string, string>, tag: string) {
  const dir = path.join(root, 'modules', name)
  mkdirSync(path.join(dir, 'migrations'), { recursive: true })
  for (const [file, body] of Object.entries(files)) writeFileSync(path.join(dir, 'migrations', file), body)
  git(dir, ['init', '--quiet', '--initial-branch=main'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'Test'])
  git(dir, ['add', '.'])
  git(dir, ['commit', '--quiet', '-m', 'initial'])
  git(dir, ['tag', tag])
  return dir
}

describe('findFrozenMigrationViolations - fixtures', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'frozen-migrations-'))
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('passes when every released migration still has the bytes it was released with', () => {
    makeFixtureModule(root, 'untouched', { '001_initial.sql': '-- init\n', '002_thing.sql': RELEASED }, 'v0.1.0')
    const { violations, checked } = findFrozenMigrationViolations({ root })
    expect(violations).toEqual([])
    expect(checked.find((c) => c.module === 'untouched')?.inspected).toBe(1)
  })

  it('catches a released migration that has been edited', () => {
    const dir = makeFixtureModule(root, 'edited', { '001_initial.sql': '-- init\n', '043_returnable.sql': RELEASED }, 'v0.1.401')
    // Exactly what happened: another statement appended to a file that had
    // already shipped and already run on a live install.
    writeFileSync(
      path.join(dir, 'migrations', '043_returnable.sql'),
      RELEASED + 'ALTER TABLE "shp_order_items" ADD COLUMN IF NOT EXISTS "non_returnable_note" TEXT;\n',
    )
    const { violations } = findFrozenMigrationViolations({ root })
    const hit = violations.find((v) => v.module === 'edited')
    expect(hit).toBeDefined()
    expect(hit?.file).toBe('migrations/043_returnable.sql')
    expect(hit?.tag).toBe('v0.1.401')
    expect(hit?.currentSha).not.toBe(hit?.releasedSha)
  })

  it('allows a NEW migration that is not in any release yet - the correct fix', () => {
    const dir = makeFixtureModule(root, 'added', { '001_initial.sql': '-- init\n', '002_thing.sql': RELEASED }, 'v0.1.0')
    writeFileSync(path.join(dir, 'migrations', '003_catchup.sql'), '-- the right way\n')
    const { violations } = findFrozenMigrationViolations({ root })
    expect(violations.filter((v) => v.module === 'added')).toEqual([])
  })

  it('exempts 001_initial.sql, which is edited in place by design', () => {
    const dir = makeFixtureModule(root, 'initedit', { '001_initial.sql': '-- init\n', '002_thing.sql': RELEASED }, 'v0.1.0')
    writeFileSync(path.join(dir, 'migrations', '001_initial.sql'), '-- init\nALTER TABLE "x" ADD COLUMN IF NOT EXISTS "b" TEXT;\n')
    const { violations } = findFrozenMigrationViolations({ root })
    expect(violations.filter((v) => v.module === 'initedit')).toEqual([])
  })

  it('reports a module it could not judge rather than counting it as clean', () => {
    const dir = path.join(root, 'modules', 'untagged')
    mkdirSync(path.join(dir, 'migrations'), { recursive: true })
    writeFileSync(path.join(dir, 'migrations', '001_initial.sql'), '-- init\n')
    git(dir, ['init', '--quiet', '--initial-branch=main'])
    const { skipped } = findFrozenMigrationViolations({ root })
    expect(skipped.some((s) => s.module === 'untagged')).toBe(true)
  })
})

describe('this repository', () => {
  it('has not edited any released module migration', () => {
    const { violations } = findFrozenMigrationViolations()
    // Named in the failure so the fix is obvious without re-running the script.
    expect(violations.map((v) => `${v.module}/${v.file} (released in ${v.tag})`)).toEqual([])
  })
})
