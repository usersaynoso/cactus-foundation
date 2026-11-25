import { describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'

// The generated tables are object literals keyed by a URL segment. A segment that
// names something on Object.prototype must miss like any other unknown name, not
// reach the prototype - that turned /constructor into a 500 instead of a 404.

const ROOT = path.join(__dirname, '..')

describe('generate-module-router', () => {
  it('looks URL-keyed tables up by own property only', async () => {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-module-router.mjs')], { cwd: ROOT, stdio: 'ignore' })

    for (const file of ['router.ts', 'router.public.ts', 'router.public-slug.ts']) {
      const src = readFileSync(path.join(ROOT, 'lib', 'modules', file), 'utf8')
      // No bare `TABLE[module]` / `TABLE[base]` read anywhere in the generated code.
      expect(src).not.toMatch(/= (?:API_ROUTES|PAGE_LOADERS|PUBLIC_PAGE_LOADERS|PUBLIC_ROUTE_HANDLERS|PUBLIC_INDEX_PAGE_LOADERS)\[/)
    }

    // router.public-slug.ts has no imports of its own, so it can be loaded and asked.
    const slug = await import('@/lib/modules/router.public-slug')
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      await expect(slug.resolveModuleIndexPage(name)).resolves.toBeNull()
    }
  })
})
