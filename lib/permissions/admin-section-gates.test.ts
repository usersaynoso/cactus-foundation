import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'

// Every admin screen must say who it is for.
//
// The sidebar hides links a role has no business with and every admin API checks
// its own permission, but neither is a gate on the screen itself: a hidden link is
// still a typed-in address, and a server component renders (and queries) before any
// API is involved. Several core screens shipped with no gate at all - Settings among
// them, which meant any signed-in staff account could open the site's configuration.
//
// So: every page under app/cactus-admin either checks a permission itself, or sits
// under a section layout that does. New screens are caught here on the change that
// adds them, rather than by whoever notices on a live site.
const ADMIN_DIR = join(process.cwd(), 'app', 'cactus-admin')

// The deliberate exceptions, each for a reason that is not "nobody got round to it".
const OPEN_PAGES = new Map<string, string>([
  ['page.tsx', 'The dashboard. Every staff account may see it; its widgets gate themselves.'],
  ['login/page.tsx', 'The login page. Signed out by definition.'],
  ['account/page.tsx', 'Your own account. Being signed in is the permission.'],
  ['inbox/page.tsx', 'A host screen with no content of its own - each tab is gated by the module that fills it, and an empty inbox says so.'],
  ['config/page.tsx', 'Gated in the file, but on "may you see any tab" rather than one key - a module settings tab lives here under the module\'s own permission.'],
  ['m/[module]/[[...path]]/page.tsx', 'The module router. A module gates its own admin pages.'],
])

const GATE_PATTERNS = [/hasPermission\b/, /hasPermissions\b/, /isAdmin\b/, /denyUnlessAny\b/]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

function isGated(file: string): boolean {
  return GATE_PATTERNS.some((re) => re.test(readFileSync(file, 'utf8')))
}

/** A section layout.tsx above this page that turns the wrong role away.
 *
 *  Specifically denyUnlessAny, not "mentions a permission": the admin root layout
 *  resolves permissions too - to build the sidebar - and accepting that would pass
 *  every page in the tree. It stops below the root for the same reason. */
function coveredByLayout(pageFile: string): boolean {
  let dir = dirname(pageFile)
  while (dir.startsWith(ADMIN_DIR) && dir !== ADMIN_DIR) {
    try {
      if (/denyUnlessAny\b/.test(readFileSync(join(dir, 'layout.tsx'), 'utf8'))) return true
    } catch {
      // no layout at this level - keep walking up
    }
    dir = dirname(dir)
  }
  return false
}

describe('admin section gates', () => {
  const pages = walk(ADMIN_DIR)

  it('finds the admin pages to check', () => {
    expect(pages.length).toBeGreaterThan(10)
  })

  it.each(pages.map((p) => [relative(ADMIN_DIR, p).split(sep).join('/'), p] as const))(
    '%s is gated, or listed as deliberately open',
    (rel, full) => {
      if (OPEN_PAGES.has(rel)) return
      const gated = isGated(full) || coveredByLayout(full)
      expect(
        gated,
        `${rel} renders an admin screen with no permission check. Add one to the page, add a ` +
          `layout.tsx for the section using denyUnlessAny (lib/permissions/section-gate), or - if it ` +
          `really is open to every signed-in staff account - add it to OPEN_PAGES with the reason.`
      ).toBe(true)
    }
  )

  it('lists no exception for a page that no longer exists', () => {
    const present = new Set(pages.map((p) => relative(ADMIN_DIR, p).split(sep).join('/')))
    for (const rel of OPEN_PAGES.keys()) expect(present.has(rel), `${rel} is listed as open but is gone`).toBe(true)
  })
})
