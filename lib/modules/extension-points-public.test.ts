import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
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

// Withholding by directory only covers React components. An extension entry
// that is a plain function - a conversation provider, a payment provider - lives
// in the module's lib/, so the directory rule calls it public and its whole
// dependency graph (a mail client's IMAP library, a telephony SDK) becomes
// reachable from a public page. Such an entry says `serverOnly: true` in its
// manifest instead, and the generator withholds it wherever it sits.
describe('serverOnly extension entries', () => {
  const MODULES_DIR = path.join(ROOT, 'modules')

  function serverOnlyImports(): string[] {
    if (!existsSync(MODULES_DIR)) return []
    const out: string[] = []
    for (const name of readdirSync(MODULES_DIR)) {
      const manifestPath = path.join(MODULES_DIR, name, 'cactus.module.json')
      if (!existsSync(manifestPath)) continue
      let manifest: { extensionPoints?: { import?: string; serverOnly?: boolean }[] }
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch {
        continue
      }
      for (const entry of manifest.extensionPoints ?? []) {
        if (entry.serverOnly !== true || !entry.import) continue
        out.push(entry.import.replace(/^\.\//, `@/modules/${name}/`))
      }
    }
    return out
  }

  it('never appear in the public map', () => {
    const published = new Set(importPaths(PUBLIC_MAP))
    const leaked = serverOnlyImports().filter((p) => published.has(p))
    expect(leaked).toEqual([])
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

// The other direction, which is the one that bites silently. Everything above
// stops admin code reaching a public bundle; nothing stopped a consumer that
// NEEDS a withheld entry from reading the public map, where it finds no
// component, resolves no providers and renders nothing at all. No error, no
// warning: tsc, eslint, the test suite and the build are all green, because an
// empty map is a legal map.
//
// It shipped exactly that way: every field provider hands back an admin Cell, so
// every one of them is withheld by the directory walk - and shop-variations read
// the public map, which took the 3D and attribute columns off a live shop's
// Variations tab with nothing anywhere saying why.
//
// A consumer that needs a withheld point wants the COMPLETE map, reached through
// a dynamic import so it stays a chunk boundary.
describe('no consumer reads the public map for a point withheld from it', () => {
  const FULL_MAP = path.join(ROOT, 'lib', 'modules', 'extension-points.ts')

  function pointKeys(file: string): string[] {
    return [...readFileSync(file, 'utf8').matchAll(/^ {2}"([^"]+)": \{/gm)].map((m) => m[1]!)
  }

  function sourceFiles(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === 'node_modules' || name.name.startsWith('.')) continue
      const full = path.join(dir, name.name)
      if (name.isDirectory()) sourceFiles(full, out)
      else if (/\.tsx?$/.test(name.name) && !/\.test\.tsx?$/.test(name.name)) out.push(full)
    }
    return out
  }

  // A point named in prose is not a point being read. Comments are where these
  // files explain which map they use and why, so they would otherwise flag every
  // one of them.
  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  }

  it('finds the maps (guard is worthless without them)', () => {
    expect(existsSync(FULL_MAP) && existsSync(PUBLIC_MAP)).toBe(true)
  })

  it('has no consumer left reading a withheld point from the public map', () => {
    if (!existsSync(FULL_MAP)) return
    const published = new Set(pointKeys(PUBLIC_MAP))
    const withheld = pointKeys(FULL_MAP).filter((k) => !published.has(k))
    expect(withheld.length, 'nothing withheld - the directory walk has stopped working').toBeGreaterThan(0)

    const offenders: string[] = []
    for (const dir of ['lib', 'modules', 'app']) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        if (file === PUBLIC_MAP || file === FULL_MAP) continue
        const src = stripComments(readFileSync(file, 'utf8'))
        if (!src.includes('@/lib/modules/extension-points.public')) continue
        for (const point of withheld) {
          if (src.includes(`'${point}'`) || src.includes(`"${point}"`)) {
            offenders.push(`${path.relative(ROOT, file)} reads withheld '${point}'`)
          }
        }
      }
    }
    expect(offenders, "use await import('@/lib/modules/extension-points') instead").toEqual([])
  })
})
