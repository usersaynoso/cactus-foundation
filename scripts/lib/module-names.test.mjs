import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getLocalModuleNames, getModuleNames } from './module-names.mjs'

// modules.local.json widens the registry for one checkout, and only when the
// file is there. Without it, the list is exactly what modules.json says.

let root

function checkout({ onDisk = [], registry, local } = {}) {
  for (const name of onDisk) mkdirSync(join(root, 'modules', name), { recursive: true })
  if (registry !== undefined) {
    writeFileSync(join(root, 'modules.json'), typeof registry === 'string' ? registry : JSON.stringify({ modules: registry.map((name) => ({ name })) }))
  }
  if (local !== undefined) {
    writeFileSync(join(root, 'modules.local.json'), typeof local === 'string' ? local : JSON.stringify(local))
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'module-names-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('CACTUS_IGNORE_LOCAL_MODULES', '')
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getModuleNames with modules.local.json', () => {
  it('without the file, is exactly the registry (unchanged behaviour)', () => {
    checkout({ onDisk: ['shop', 'private-mod', 'stale'], registry: ['shop'] })
    expect(getModuleNames(root)).toEqual(['shop'])
  })

  it('adds a locally listed module whose code is on disk', () => {
    checkout({ onDisk: ['shop', 'private-mod', 'stale'], registry: ['shop'], local: { modules: [{ name: 'private-mod' }] } })
    expect(getModuleNames(root)).toEqual(['private-mod', 'shop'])
  })

  it('ignores a locally listed name with no code on disk, as the registry does', () => {
    checkout({ onDisk: ['shop'], registry: ['shop'], local: { modules: [{ name: 'not-cloned' }] } })
    expect(getModuleNames(root)).toEqual(['shop'])
  })

  it('a malformed file is reported and ignored, never costing the real registry', () => {
    for (const bad of ['{not json', '{"modules": "nope"}', '[]', 'null']) {
      checkout({ onDisk: ['shop', 'private-mod'], registry: ['shop'], local: bad })
      expect(getModuleNames(root)).toEqual(['shop'])
    }
    expect(console.warn).toHaveBeenCalled()
  })

  it('skips entries without a usable name', () => {
    checkout({ onDisk: ['shop', 'private-mod'], registry: ['shop'], local: { modules: [{}, { name: '' }, { name: 3 }, null, { name: 'private-mod' }] } })
    expect(getModuleNames(root)).toEqual(['private-mod', 'shop'])
  })

  it('is ignored entirely inside a build (CACTUS_IGNORE_LOCAL_MODULES=1)', () => {
    vi.stubEnv('CACTUS_IGNORE_LOCAL_MODULES', '1')
    checkout({ onDisk: ['shop', 'private-mod'], registry: ['shop'], local: { modules: [{ name: 'private-mod' }] } })
    expect(getModuleNames(root)).toEqual(['shop'])
  })

  it('with no modules.json at all, the directory fallback is unchanged', () => {
    checkout({ onDisk: ['a', 'b'], local: { modules: [{ name: 'c' }] } })
    expect(getModuleNames(root)).toEqual(['a', 'b'])
  })
})

describe('getLocalModuleNames', () => {
  it('returns nothing when the file is absent', () => {
    expect(getLocalModuleNames(root, {})).toEqual([])
  })

  it('reads the names, and honours the build switch it is handed', () => {
    checkout({ local: { modules: [{ name: 'x', repoUrl: 'ignored', version: 'v1' }] } })
    expect(getLocalModuleNames(root, {})).toEqual(['x'])
    expect(getLocalModuleNames(root, { CACTUS_IGNORE_LOCAL_MODULES: '1' })).toEqual([])
  })
})

// The build paths, checked at the source: prebuild switches the local list off
// for everything it runs, and checkout-modules never reads the file at all.
describe('build and release paths ignore modules.local.json', () => {
  const scripts = join(import.meta.dirname, '..')
  it('prebuild sets CACTUS_IGNORE_LOCAL_MODULES=1 for its steps', () => {
    expect(readFileSync(join(scripts, 'prebuild.mjs'), 'utf8')).toMatch(/CACTUS_IGNORE_LOCAL_MODULES: '1'/)
  })
  it('checkout-modules reads modules.json only', () => {
    const code = readFileSync(join(scripts, 'checkout-modules.mjs'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/modules\.local|LOCAL_REGISTRY_FILE|getLocalModuleNames|getModuleNames/)
  })
})
