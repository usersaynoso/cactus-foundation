import path from 'path'
import { describe, it, expect } from 'vitest'
import { findRegistryImportCycles } from '../../scripts/check-import-cycles.mjs'

// Sibling of client-graph.test.ts, and there for the same reason: a defect
// class that `tsc`, `eslint` and every other test are perfectly happy with, and
// that only shows itself as a production build failure on somebody else's
// module set.
//
// A generated registry statically imports every module's contributed
// components; a module file that consumes that registry with a plain import
// closes a loop. Turbopack merges the modules in a cycle into one scope, where
// a `const` read during evaluation throws "Cannot access 'x' before
// initialization". Whether it throws at all depends on the order the graph is
// entered in, so the same code builds on one install and dies on another - the
// worst kind of bug to have no gate for.
//
// The prebuild copy (scripts/check-import-cycles.mjs) is the one that matters
// for an install, because it sees that install's pinned module versions. This
// runs the identical walk over the module checkouts on this machine, so a cycle
// introduced in core shows up in `npm test`.

describe('generated registry import graph', () => {
  it('has no import cycles beyond the recorded ones', () => {
    const { unexpected, checked } = findRegistryImportCycles(path.join(process.cwd()))
    expect(
      unexpected,
      `new import cycle(s) between a generated registry and module code.\n` +
        `Reach the registry through \`await import(...)\` inside the consuming function:\n\n  ${unexpected.join('\n\n  ')}\n`,
    ).toEqual([])
    // A tree with no generated registries would pass the assertion above while
    // proving nothing at all, which is the failure mode this whole file exists
    // to avoid. Run `npm run typecheck` (it generates) before the suite.
    expect(checked.length, 'no generated registry was found to check - run the generators first').toBeGreaterThan(0)
  })

  it('records no cycle that has since been fixed', () => {
    const { stale } = findRegistryImportCycles(path.join(process.cwd()))
    expect(
      stale,
      `these entries on the KNOWN list in scripts/check-import-cycles.mjs no longer cycle and should be deleted:\n\n  ${stale.join('\n  ')}\n`,
    ).toEqual([])
  })
})
