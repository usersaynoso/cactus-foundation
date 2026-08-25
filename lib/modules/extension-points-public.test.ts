import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

// lib/modules/extension-points.ts is ONE flat map, so importing it to read a
// single point statically pulls in every point's implementation - including 25
// module admin screens. Plenty of consumers sit on the public render path, and
// the result measured on a live site was a homepage whose bundle carried a 107KB
// variations panel, a 58KB fabric editor and a 44KB abandoned-carts screen, none
// of which it renders. 807 reachable files, 60 of them module admin components.
//
// extension-points.public.ts is the same map with the admin entries withheld.
// Switching the public-path consumers to it took that to 737 and 6.
//
// Neither tsc nor eslint can see any of this. The only symptom is weight.

const ROOT = path.join(__dirname, '..', '..')
const PUBLIC_MAP = path.join(ROOT, 'lib', 'modules', 'extension-points.public.ts')

function importPaths(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]!)
}

describe('the public extension-point map', () => {
  it('exists - the generator emits it alongside the full map', () => {
    expect(existsSync(PUBLIC_MAP)).toBe(true)
  })

  it('imports nothing from a module components/admin directory', () => {
    const admin = importPaths(PUBLIC_MAP).filter((p) => p.includes('/components/admin/'))
    expect(admin).toEqual([])
  })

  it('is a subset of the full map, not a divergent copy', () => {
    const full = path.join(ROOT, 'lib', 'modules', 'extension-points.ts')
    if (!existsSync(full)) return
    const fullImports = new Set(importPaths(full))
    const extra = importPaths(PUBLIC_MAP).filter((p) => !fullImports.has(p))
    expect(extra).toEqual([])
  })
})

// Core's own consumers on a public path. A new one added against the full map
// would quietly put every module admin screen back into every page's bundle, and
// nothing else in the toolchain would say a word about it.
describe('core public-path files use the public map', () => {
  const PUBLIC_CONSUMERS = [
    'lib/media/reference-rewriters.ts',
    'lib/media/usage-providers.ts',
    'lib/well-known/providers.ts',
    'lib/members/account-nav.ts',
    'lib/modules/menu-entity-provider.ts',
    'app/(public)/cactus-account/page.tsx',
  ]

  it.each(PUBLIC_CONSUMERS)('%s imports extension-points.public', (rel) => {
    const file = path.join(ROOT, rel)
    expect(existsSync(file), `${rel} has moved or gone - update this list`).toBe(true)
    const src = readFileSync(file, 'utf8')
    expect(src).toContain("@/lib/modules/extension-points.public")
    // The full map must not sneak back in alongside it.
    expect(src).not.toMatch(/from '@\/lib\/modules\/extension-points'/)
  })
})
