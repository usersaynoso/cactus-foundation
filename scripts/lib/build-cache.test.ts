import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, stat, symlink, cp, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { PACKED_CACHE, packBuildCache, restoreBuildCache, discardBuildCache } from './build-cache.mjs'

let root: string
const quiet = () => {}
const raw = () => path.join(root, '.next/cache/turbopack')
const packed = () => path.join(root, '.next/cache', PACKED_CACHE)
async function put(relative: string, content: string | Buffer) {
  const target = path.join(root, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}
async function snapshot() {
  await put('.next/cache/turbopack/v16/CURRENT', '00000001.sst\n')
  await put('.next/cache/turbopack/v16/00000001.sst', Buffer.alloc(1024 * 1024, 37))
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'cactus-cache-test-'))
  await put('node_modules/next/package.json', '{"version":"16.3.4"}')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

describe('complete compilation cache snapshots', () => {
  it('round-trips every byte and timestamp, then removes the packed copy', async () => {
    await snapshot()
    const file = path.join(raw(), 'v16/00000001.sst')
    const before = await readFile(file)
    const modified = (await stat(file)).mtimeMs
    expect(await packBuildCache(root, quiet)).toBe(true)
    expect(existsSync(raw())).toBe(false)
    expect(await restoreBuildCache(root, { log: quiet })).toBe(true)
    expect(await readFile(file)).toEqual(before)
    expect(Math.abs((await stat(file)).mtimeMs - modified)).toBeLessThan(1)
    expect(await readFile(path.join(raw(), 'v16/CURRENT'), 'utf8')).toBe('00000001.sst\n')
    expect(existsSync(packed())).toBe(false)
  })

  it('leaves incompressible caches intact instead of making them larger', async () => {
    await put('.next/cache/turbopack/random', randomBytes(100_000))
    expect(await packBuildCache(root, quiet)).toBe(false)
    expect(existsSync(path.join(raw(), 'random'))).toBe(true)
    expect(existsSync(packed())).toBe(false)
  })

  it.each(['truncated', 'checksum', 'missing', 'traversal', 'duplicate', 'oversized', 'link'])('rejects a %s snapshot without publishing partial files', async (problem) => {
    await snapshot()
    await packBuildCache(root, quiet)
    const manifestPath = path.join(packed(), 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (problem === 'truncated') await writeFile(path.join(packed(), '0.br'), 'broken')
    if (problem === 'checksum') manifest.files[0].hash = '0'.repeat(64)
    if (problem === 'missing') await rm(path.join(packed(), '0.br'))
    if (problem === 'traversal') manifest.files[0].path = '../../escaped'
    if (problem === 'duplicate') manifest.files.push(manifest.files[0])
    if (problem === 'oversized') manifest.files[0].size = 10 * 1024 ** 3
    if (problem === 'link') {
      await rm(path.join(packed(), '0.br'))
      await symlink(manifestPath, path.join(packed(), '0.br'))
    }
    await writeFile(manifestPath, JSON.stringify(manifest))
    expect(await restoreBuildCache(root, { log: quiet })).toBe(false)
    expect(existsSync(raw())).toBe(false)
    expect(existsSync(packed())).toBe(false)
    expect(existsSync(path.join(root, '.next/cache/escaped'))).toBe(false)
  })

  it('does not pack symlinks or follow files outside the compilation cache', async () => {
    await snapshot()
    await symlink(path.join(root, 'node_modules'), path.join(raw(), 'outside'))
    await expect(packBuildCache(root, quiet)).rejects.toThrow('link or special file')
    expect(existsSync(path.join(raw(), 'v16/CURRENT'))).toBe(true)
  })

  it('rejects a different Next.js version and honours the cache-off recovery switch', async () => {
    await snapshot()
    await packBuildCache(root, quiet)
    await put('node_modules/next/package.json', '{"version":"16.3.5"}')
    expect(await restoreBuildCache(root, { log: quiet })).toBe(false)
    await snapshot()
    await packBuildCache(root, quiet)
    expect(await restoreBuildCache(root, { enabled: false, log: quiet })).toBe(false)
    expect(existsSync(raw())).toBe(false)
    expect(existsSync(packed())).toBe(false)
  })

  it('the watchdog discards packed and raw copies before a cold retry', async () => {
    await snapshot()
    await packBuildCache(root, quiet)
    await snapshot()
    await discardBuildCache(root)
    expect(existsSync(raw())).toBe(false)
    expect(existsSync(packed())).toBe(false)
  })
})

describe('pruning the actual fixture filesystem', () => {
  async function prune(budget: number, armed = '1') {
    await mkdir(path.join(root, 'scripts/lib'), { recursive: true })
    await cp(path.resolve('scripts/prune-build-cache.mjs'), path.join(root, 'scripts/prune-build-cache.mjs'))
    await cp(path.resolve('scripts/lib/build-cache.mjs'), path.join(root, 'scripts/lib/build-cache.mjs'))
    return execFileSync(process.execPath, ['scripts/prune-build-cache.mjs'], {
      cwd: root, encoding: 'utf8', env: { ...process.env, CACTUS_PRUNE_BUILD_CACHE: armed, CACTUS_BUILD_CACHE_BUDGET_MB: String(budget) },
    })
  }
  async function traces(files: string[]) {
    await put('.next/server/example.nft.json', JSON.stringify({ version: 1, files }))
  }

  it('keeps tooling and the raw compiler cache when both already fit', async () => {
    await snapshot()
    await put('node_modules/typescript/index.js', 'tool')
    await prune(20)
    expect(existsSync(path.join(root, 'node_modules/typescript/index.js'))).toBe(true)
    expect(existsSync(raw())).toBe(true)
  })

  it('packs an oversized compiler before sacrificing dependencies', async () => {
    await snapshot()
    await put('node_modules/typescript/index.js', Buffer.alloc(100_000))
    await prune(0.5)
    expect(existsSync(path.join(root, 'node_modules/typescript/index.js'))).toBe(true)
    expect(existsSync(packed())).toBe(true)
    expect(await restoreBuildCache(root, { log: quiet })).toBe(true)
  })

  it('stops deleting packages once the budget fits', async () => {
    await put('node_modules/prisma/index.js', Buffer.alloc(1024 * 1024))
    await put('node_modules/typescript/index.js', Buffer.alloc(1024 * 1024))
    await traces(['../../node_modules/next/package.json'])
    await prune(1.5)
    expect(existsSync(path.join(root, 'node_modules/prisma'))).toBe(false)
    expect(existsSync(path.join(root, 'node_modules/typescript'))).toBe(true)
  })

  it('protects a parent package whose nested dependency is traced, plus Next and SWC', async () => {
    await put('node_modules/parent/node_modules/nested/index.js', Buffer.alloc(300_000))
    await put('node_modules/@next/swc-test/index.js', Buffer.alloc(300_000))
    await put('node_modules/unneeded/index.js', Buffer.alloc(300_000))
    await traces(['../../node_modules/parent/node_modules/nested/index.js'])
    await prune(0.7)
    expect(existsSync(path.join(root, 'node_modules/parent/node_modules/nested/index.js'))).toBe(true)
    expect(existsSync(path.join(root, 'node_modules/@next/swc-test/index.js'))).toBe(true)
    expect(existsSync(path.join(root, 'node_modules/next/package.json'))).toBe(true)
    expect(existsSync(path.join(root, 'node_modules/unneeded'))).toBe(false)
  })

  it('keeps dependencies if even the minimum compiler footprint cannot fit', async () => {
    await put('.next/cache/turbopack/random', randomBytes(1024 * 1024))
    await put('node_modules/next/runtime.js', Buffer.alloc(300_000))
    await put('node_modules/typescript/index.js', Buffer.alloc(100_000))
    await traces(['../../node_modules/next/runtime.js'])
    await prune(0.5)
    expect(existsSync(raw())).toBe(false)
    expect(existsSync(path.join(root, 'node_modules/typescript/index.js'))).toBe(true)
  })

  it('still applies the safe cleanup policy when packing fails', async () => {
    await snapshot()
    await symlink(path.join(root, 'node_modules'), path.join(raw(), 'outside'))
    await put('node_modules/typescript/index.js', Buffer.alloc(100_000))
    await traces(['../../node_modules/next/package.json'])
    expect(await prune(0.5)).toContain('Could not pack compilation cache')
    expect(existsSync(raw())).toBe(false)
    expect(existsSync(path.join(root, 'node_modules/typescript/index.js'))).toBe(true)
    expect(existsSync(path.join(root, 'node_modules/next/package.json'))).toBe(true)
  })

  it.each(['missing', 'invalid', 'malformed'])('leaves dependencies alone with %s traces', async (kind) => {
    await put('node_modules/typescript/index.js', Buffer.alloc(1024 * 1024))
    if (kind === 'invalid') await put('.next/server/example.nft.json', '{')
    if (kind === 'malformed') await put('.next/server/example.nft.json', '{"files":[42]}')
    await prune(0.1)
    expect(existsSync(path.join(root, 'node_modules/typescript/index.js'))).toBe(true)
  })

  it('does nothing when explicitly disarmed', async () => {
    await snapshot()
    await prune(0.1, '0')
    expect(existsSync(raw())).toBe(true)
  })

  it('the build wrapper restores before invoking its CLI even with pruning disabled', async () => {
    await snapshot()
    await packBuildCache(root, quiet)
    await prune(100, '0') // Copies the helper scripts, without changing the fixture.
    await cp(path.resolve('scripts/next-build.mjs'), path.join(root, 'scripts/next-build.mjs'))
    // A fixture CLI, not Next.js: no production build, database or application.
    await put('node_modules/.bin/next', `#!/usr/bin/env node
const fs = require('node:fs');
if (fs.readFileSync('.next/cache/turbopack/v16/CURRENT', 'utf8') !== '00000001.sst\\n') process.exit(1);
console.log('fixture CLI saw the restored cache');
`)
    await chmod(path.join(root, 'node_modules/.bin/next'), 0o755)
    const output = execFileSync(process.execPath, ['scripts/next-build.mjs'], {
      cwd: root, encoding: 'utf8', env: {
        ...process.env, CACTUS_BUILD_WATCHDOG: '0', CACTUS_PRUNE_BUILD_CACHE: '0', CACTUS_TURBOPACK_BUILD_CACHE: '1',
      },
    })
    expect(output).toContain('fixture CLI saw the restored cache')
    expect(existsSync(packed())).toBe(false)
    expect(existsSync(raw())).toBe(true)
  })
})
