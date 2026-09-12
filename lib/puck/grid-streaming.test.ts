import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import path from 'path'

// Why this is a test and not a code review note:
//
// A Puck block's RSC half is an async server component, and an async component
// with NO Suspense boundary above it blocks the entire first flush of the page.
// Not its own corner of the page - the whole response. So one block doing a
// product query holds up the header, the hero, the nav and every other block,
// and the shopper watches a blank browser until the slowest query on the page
// finishes.
//
// MEASURED COLD ON THE LIVE SITE, before this was fixed:
//
//   /green-office-chairs (a filter collection)   4.33s to first byte
//   /24-hour-office-chairs                       3.46s
//   /  (homepage, five grid blocks)              2.90s
//   /find-your-furniture (far more work, but
//    already behind a boundary)                  0.70s
//
// The last line is the whole argument. That page resolves five hundred products,
// runs every filter over all of them, prices them and orders them - considerably
// more work than a category page - and it answered in a fifth of the time,
// because its heavy half was behind a boundary and the shell could go out
// immediately. The work is identical either way. What changes is whether
// anything else on the page has to wait for it.
//
// And it is invisible to every other check: it typechecks, it lints, it renders
// byte-for-byte the same markup, and every test passes. The only symptom is a
// slow first byte on somebody else's machine, which is why it sat there for
// months across six blocks.

const ROOT = path.join(__dirname, '..', '..')

/**
 * The helpers that mean "this block queries the catalogue". A block reaching any
 * of them is doing the kind of work worth streaming; a block that only formats
 * props it was handed is not, and wrapping those would be noise.
 */
const HEAVY = [
  'listProducts',
  'listGridProducts',
  'buildGridCardItems',
  'renderCards',
  'getProductFilterMatches',
  'loadScopedProducts',
  'buildDiscoveryDataset',
]

function heavyBlocksWithoutABoundary(): string[] {
  let listed = ''
  try {
    listed = execFileSync('sh', ['-c', 'ls modules/*/components/puck/*.rsc.tsx 2>/dev/null'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
  } catch {
    // No modules checked out - a fresh core clone. Nothing to check, and that is
    // a pass rather than a failure: this guard is about module code.
    return []
  }
  const offenders: string[] = []
  for (const rel of listed.split('\n').filter(Boolean)) {
    const source = readFileSync(path.join(ROOT, rel), 'utf8')
    if (!/async function/.test(source)) continue
    if (!HEAVY.some((name) => source.includes(name))) continue
    // The boundary has to be in this file: the registries hand Puck whatever
    // `render` this module exports, so there is nothing above it to wrap it.
    if (source.includes('<Suspense')) continue
    offenders.push(rel)
  }
  return offenders
}

describe('every catalogue-querying block streams rather than blocking the first byte', () => {
  it('no heavy RSC block is missing its Suspense boundary', () => {
    const offenders = heavyBlocksWithoutABoundary()
    expect(
      offenders,
      `These query the catalogue in an async server component with no Suspense\n` +
        `boundary, so the WHOLE page waits for them before its first byte - header,\n` +
        `hero and all. Wrap the async work: a plain function returning\n` +
        `<Suspense fallback={<CardGridSkeleton …/>}> around an async body. The\n` +
        `boundary must sit OUTSIDE the async component, or it streams nothing.\n` +
        `See modules/shop/components/puck/ShopProductGrid.rsc.tsx:\n\n  ` +
        offenders.join('\n  ') +
        '\n',
    ).toEqual([])
  })
})
