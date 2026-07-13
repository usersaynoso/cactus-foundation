// Pure reconciliation planner for the core update. Deliberately dependency-free (no
// octokit, no env, no package.json) so it is trivially unit-testable and so the logic
// that decides what to write/delete can never be broken by an unrelated import. The IO
// (blob fetches, the write transaction) lives in core.ts, which re-exports these.

// A path is the install's OWN territory - never written or removed by the core sync -
// when it is a module checkout, the submodule file, or the module registry.
export function isSkippedCorePath(path: string): boolean {
  return path === '.gitmodules' || path === 'modules.json' || path.startsWith('modules/')
}

export interface CoreTreeEntry {
  sha: string
  mode: '100644' | '100755'
}

export interface CoreSyncPlan {
  // Target-tag core paths whose content differs from (or is absent in) the real base.
  writes: { path: string; mode: '100644' | '100755'; sha: string }[]
  // Base paths that are core-managed, removed upstream, and still present in base.
  deletes: string[]
}

// Given the upstream TARGET tree, the FROM tree (used only to tell a core-managed file
// apart from a user's own file), and the admin repo's ACTUAL base tree, decide the
// minimal writes + deletes that make core match the target.
//
// Every decision is made against the REAL base - not the upstream from-tag - so the
// update self-heals no matter how the repo drifted: a failed update that advanced HEAD,
// a user editing a core file, a half-applied or version-skipping update. Git blob shas
// are content-addressed, so an equal sha means identical content - an exact, network-free
// "already correct" test.
export function planCoreSync(args: {
  toEntries: Map<string, CoreTreeEntry>
  fromPaths: Set<string>
  baseShaByPath: Map<string, string>
  baseTruncated: boolean
}): CoreSyncPlan {
  const { toEntries, fromPaths, baseShaByPath, baseTruncated } = args
  const writes: CoreSyncPlan['writes'] = []
  for (const [path, entry] of toEntries) {
    if (isSkippedCorePath(path)) continue
    if (baseShaByPath.get(path) === entry.sha) continue // base already holds identical content
    writes.push({ path, mode: entry.mode, sha: entry.sha })
  }
  const deletes: string[] = []
  // If the base tree read was truncated we cannot prove a path is present, so skip ALL
  // deletions rather than risk a BadObjectState on a phantom delete. Safe: it only ever
  // leaves an already-removed core file in place, and never errors. (Cactus repos are
  // ~800 files, far under GitHub's 100k/7MB truncation ceiling - this is belt-and-braces.)
  if (!baseTruncated) {
    for (const path of fromPaths) {
      if (isSkippedCorePath(path)) continue
      if (toEntries.has(path)) continue // still shipped in the target
      if (!baseShaByPath.has(path)) continue // already gone from base - deleting it 422s
      deletes.push(path)
    }
  }
  return { writes, deletes }
}
