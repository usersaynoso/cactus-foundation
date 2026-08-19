import path from 'path'
import { describe, it, expect } from 'vitest'
import { findClientGraphLeaks } from '../../scripts/check-client-graph.mjs'

// The same walk the prebuild runs (scripts/check-client-graph.mjs), against the
// module checkouts on this machine, so a leak introduced in core shows up in
// `npm test` rather than waiting for a deploy. The prebuild copy is the one
// that matters for an install - it sees that install's pinned module versions -
// but it only runs on a real build, and nobody runs those locally.
//
// Why this is a test at all: `tsc` and `eslint` both stayed green through the
// 2026-08-19 outage. See the script's header for the full story.

describe('client component import graph', () => {
  it('never reaches server-only code', () => {
    const leaks = findClientGraphLeaks(path.join(process.cwd()))
    expect(leaks, `client file(s) reaching server-only code:\n\n  ${leaks.join('\n\n  ')}\n`).toEqual([])
  })
})
