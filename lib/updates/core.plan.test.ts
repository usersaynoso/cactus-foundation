import { describe, it, expect } from 'vitest'
import { planCoreSync, isSkippedCorePath, type CoreTreeEntry } from './core-plan'

// Helpers to build the pure planner's inputs tersely.
const to = (entries: Record<string, string>): Map<string, CoreTreeEntry> => {
  const m = new Map<string, CoreTreeEntry>()
  for (const [path, sha] of Object.entries(entries)) m.set(path, { sha, mode: '100644' })
  return m
}
const base = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries))
const paths = (...p: string[]): Set<string> => new Set(p)

const plan = (args: Parameters<typeof planCoreSync>[0]) => planCoreSync(args)
const writePaths = (r: ReturnType<typeof planCoreSync>) => r.writes.map((w) => w.path).sort()

describe('isSkippedCorePath', () => {
  it('protects the install-owned territory', () => {
    expect(isSkippedCorePath('.gitmodules')).toBe(true)
    expect(isSkippedCorePath('modules.json')).toBe(true)
    expect(isSkippedCorePath('modules/contact-form/index.ts')).toBe(true)
  })
  it('treats ordinary core files as writable', () => {
    expect(isSkippedCorePath('lib/updates/core.ts')).toBe(false)
    expect(isSkippedCorePath('app/(public)/layout.tsx')).toBe(false)
  })
})

describe('planCoreSync writes', () => {
  it('writes a file that is new in the target (absent from base)', () => {
    const r = plan({
      toEntries: to({ 'lib/new.ts': 'aaa' }),
      fromPaths: paths(),
      baseShaByPath: base({}),
      baseTruncated: false,
    })
    expect(writePaths(r)).toEqual(['lib/new.ts'])
  })

  it('writes a file whose base content differs from the target', () => {
    const r = plan({
      toEntries: to({ 'lib/a.ts': 'new' }),
      fromPaths: paths('lib/a.ts'),
      baseShaByPath: base({ 'lib/a.ts': 'old' }),
      baseTruncated: false,
    })
    expect(writePaths(r)).toEqual(['lib/a.ts'])
  })

  it('skips a file whose base content already equals the target (content-addressed)', () => {
    const r = plan({
      toEntries: to({ 'lib/a.ts': 'same' }),
      fromPaths: paths('lib/a.ts'),
      baseShaByPath: base({ 'lib/a.ts': 'same' }),
      baseTruncated: false,
    })
    expect(r.writes).toEqual([])
  })

  it('heals drift: a file unchanged upstream but stale in base is still written', () => {
    // from === to sha ('v2'), but the repo drifted to 'stale' (e.g. a user edit or a
    // half-applied prior update). The old from->to diff skipped this; reconcile fixes it.
    const r = plan({
      toEntries: to({ 'lib/a.ts': 'v2' }),
      fromPaths: paths('lib/a.ts'),
      baseShaByPath: base({ 'lib/a.ts': 'stale' }),
      baseTruncated: false,
    })
    expect(writePaths(r)).toEqual(['lib/a.ts'])
  })

  it('never writes install-owned paths even if present in the target tree', () => {
    const r = plan({
      toEntries: to({ 'modules.json': 'x', 'modules/foo/a.ts': 'y', '.gitmodules': 'z', 'lib/a.ts': 'w' }),
      fromPaths: paths(),
      baseShaByPath: base({}),
      baseTruncated: false,
    })
    expect(writePaths(r)).toEqual(['lib/a.ts'])
  })
})

describe('planCoreSync deletes', () => {
  it('deletes a core file that upstream removed and is still present in base', () => {
    const r = plan({
      toEntries: to({}),
      fromPaths: paths('lib/gone.ts'),
      baseShaByPath: base({ 'lib/gone.ts': 'sha' }),
      baseTruncated: false,
    })
    expect(r.deletes).toEqual(['lib/gone.ts'])
  })

  it('does NOT delete a path already absent from base (the failed-update 422 bug)', () => {
    // Present in from-tag, removed in target, but the repo (advanced by a failed update)
    // no longer has it. A sha:null for an absent path is what threw GitRPC::BadObjectState.
    const r = plan({
      toEntries: to({}),
      fromPaths: paths('app/media/MediaUploadQueue.tsx'),
      baseShaByPath: base({}),
      baseTruncated: false,
    })
    expect(r.deletes).toEqual([])
  })

  it('never deletes a user-owned file (absent from the from-tag)', () => {
    const r = plan({
      toEntries: to({}),
      fromPaths: paths(),
      baseShaByPath: base({ 'app/my-custom-page.tsx': 'sha' }),
      baseTruncated: false,
    })
    expect(r.deletes).toEqual([])
  })

  it('does not delete a path still shipped in the target', () => {
    const r = plan({
      toEntries: to({ 'lib/a.ts': 'v2' }),
      fromPaths: paths('lib/a.ts'),
      baseShaByPath: base({ 'lib/a.ts': 'v1' }),
      baseTruncated: false,
    })
    expect(r.deletes).toEqual([])
  })

  it('never deletes install-owned paths', () => {
    const r = plan({
      toEntries: to({}),
      fromPaths: paths('modules.json', 'modules/foo/a.ts', '.gitmodules'),
      baseShaByPath: base({ 'modules.json': 'a', 'modules/foo/a.ts': 'b', '.gitmodules': 'c' }),
      baseTruncated: false,
    })
    expect(r.deletes).toEqual([])
  })

  it('skips ALL deletions when the base tree read was truncated', () => {
    const r = plan({
      toEntries: to({}),
      fromPaths: paths('lib/gone.ts'),
      baseShaByPath: base({ 'lib/gone.ts': 'sha' }),
      baseTruncated: true,
    })
    expect(r.deletes).toEqual([])
  })
})

describe('planCoreSync end-to-end drift scenario', () => {
  it('reconciles a drifted repo toward target in one plan', () => {
    const r = plan({
      // target ships a.ts@v2, b.ts@v2 (b unchanged upstream), c.ts new; d.ts removed.
      toEntries: to({ 'lib/a.ts': 'a2', 'lib/b.ts': 'b2', 'lib/c.ts': 'c1' }),
      fromPaths: paths('lib/a.ts', 'lib/b.ts', 'lib/d.ts'),
      // repo drifted: a.ts stale, b.ts already correct, c.ts missing, d.ts already gone,
      // plus a user file that must be left alone.
      baseShaByPath: base({ 'lib/a.ts': 'a-stale', 'lib/b.ts': 'b2', 'app/user.tsx': 'u' }),
      baseTruncated: false,
    })
    expect(writePaths(r)).toEqual(['lib/a.ts', 'lib/c.ts'])
    expect(r.deletes).toEqual([]) // d.ts already gone -> no phantom delete
  })
})
