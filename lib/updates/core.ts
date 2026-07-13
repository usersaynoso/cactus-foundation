// Core update library: compares this install against the upstream Cactus Foundation
// repo and can sync changed core files into the admin's own GitHub repo via the
// Git Data API (createBlob → createTree → createCommit → updateRef).
// Modules, .gitmodules, and user content are never touched.

import { Octokit } from '@octokit/rest'
import pkg from '@/package.json'
import { getGithubClient } from '@/lib/github/client'
import { retryTransient, createReplicatedBlob } from '@/lib/github/retry'
import { isGitHubConfigured, isLocalMode } from '@/lib/config/env'
import { markdownToHtml } from '@/lib/sanitize'

const UPSTREAM_REPO = process.env.CACTUS_CORE_REPO ?? 'usersaynoso/cactus-foundation'

function parseRepo(raw: string): { owner: string; repo: string } {
  const [owner, repo] = raw.split('/')
  if (!owner || !repo) throw new Error(`Invalid repo format: ${raw}`)
  return { owner, repo }
}

function getMainRepo(): { owner: string; repo: string } {
  const raw = process.env.GITHUB_REPO ?? ''
  const [owner, repo] = raw.split('/')
  if (!owner || !repo) throw new Error('GITHUB_REPO environment variable must be set as "owner/repo"')
  return { owner, repo }
}

// Strips a leading "v" and compares numeric major.minor.patch.
// Returns positive if a > b, negative if a < b, 0 if equal.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return (aMaj ?? 0) - (bMaj ?? 0)
  if (aMin !== bMin) return (aMin ?? 0) - (bMin ?? 0)
  return (aPat ?? 0) - (bPat ?? 0)
}

export type CoreUpdateStatus =
  // Local-development mode: updates ship via git + Vercel redeploy, neither of
  // which exists locally. The panel shows an informational note instead.
  | { localMode: true; currentVersion: string }
  // Genuinely not configured: no GitHub App installation and no GITHUB_API_TOKEN.
  | { configured: false }
  // Configured, but the upstream read failed for some other reason.
  | { configured: true; error: string }
  // Configured and the check succeeded.
  | {
      configured: true
      currentVersion: string
      latestVersion: string
      updateAvailable: boolean
      releaseNotesHtml: string
      latestUrl: string
      publishedAt: string | null
    }

// In-memory cache keyed by channel. Successful results live for the full TTL;
// failures are cached briefly so a fixed config recovers quickly.
const _cache = new Map<string, { status: CoreUpdateStatus; at: number }>()
const CACHE_TTL_MS = 10 * 60_000
const ERROR_CACHE_TTL_MS = 30_000

function isErrorStatus(s: CoreUpdateStatus): boolean {
  if ('localMode' in s) return false
  return !s.configured || 'error' in s
}

// Reads the upstream releases. Tries the authenticated client first (when GitHub
// is configured) so a private upstream fork the installation can reach still
// works, then falls back to an unauthenticated client — the canonical upstream
// repo is public, so this resolves the common case where the App installation
// does not include the upstream repo.
async function fetchUpstreamReleases(owner: string, repo: string, configured: boolean) {
  if (configured) {
    try {
      const octokit = await getGithubClient()
      const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 100 })
      return data
    } catch {
      // Fall through to an unauthenticated read of the public upstream repo.
    }
  }
  const octokit = new Octokit()
  const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 100 })
  return data
}

// Reads a single page of upstream releases (newest first). Mirrors
// fetchUpstreamReleases' auth-then-unauth fallback so a private upstream fork
// still works, but takes page/per_page for the About panel's infinite scroll.
async function fetchUpstreamReleasesPage(
  owner: string,
  repo: string,
  configured: boolean,
  page: number,
  perPage: number,
) {
  if (configured) {
    try {
      const octokit = await getGithubClient()
      const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: perPage, page })
      return data
    } catch {
      // Fall through to an unauthenticated read of the public upstream repo.
    }
  }
  const octokit = new Octokit()
  const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: perPage, page })
  return data
}

export type ReleaseNoteItem = {
  version: string
  tag: string
  publishedAt: string | null
  html: string
  url: string
}

// Paginated release notes for the admin About dialog. Unlike getCoreUpdateStatus
// (which only aggregates releases NEWER than the running version, filtered by
// channel), this returns EVERY published release newest-first regardless of the
// prerelease flag - the About panel is a full history, not an update prompt. The
// public upstream repo is readable unauthenticated, so this also works locally.
export async function getReleaseNotesPage(
  opts: { page: number; perPage?: number },
): Promise<{ items: ReleaseNoteItem[]; hasMore: boolean }> {
  const perPage = Math.min(Math.max(opts.perPage ?? 15, 1), 100)
  const page = Math.max(opts.page, 1)
  const { owner, repo } = parseRepo(UPSTREAM_REPO)
  const configured = await isGitHubConfigured()

  const releases = await fetchUpstreamReleasesPage(owner, repo, configured, page, perPage)
  // A full page back implies there may be more; a short page means we hit the end.
  const hasMore = releases.length === perPage
  const items: ReleaseNoteItem[] = releases
    .filter((r) => !r.draft)
    .map((r) => ({
      version: r.tag_name.replace(/^v/, ''),
      tag: r.tag_name,
      publishedAt: r.published_at ?? null,
      html: r.body?.trim() ? markdownToHtml(r.body) : '',
      url: r.html_url,
    }))

  return { items, hasMore }
}

export async function getCoreUpdateStatus(
  opts?: { bust?: boolean; channel?: 'public' | 'beta' }
): Promise<CoreUpdateStatus> {
  // Core updates rewrite the admin's GitHub repo and rely on a Vercel redeploy +
  // webhook. None of that exists locally, so report local mode and skip the check.
  if (isLocalMode()) {
    return { localMode: true, currentVersion: pkg.version }
  }

  const channel = opts?.channel ?? 'public'
  const now = Date.now()
  const cached = _cache.get(channel)
  if (!opts?.bust && cached) {
    const ttl = isErrorStatus(cached.status) ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS
    if (now - cached.at < ttl) return cached.status
  }

  const currentVersion = pkg.version
  const { owner: upOwner, repo: upRepo } = parseRepo(UPSTREAM_REPO)

  // "configured" reflects the actual GitHub config state, independent of whether
  // the upstream read happens to succeed.
  const configured = await isGitHubConfigured()

  try {
    // Fetch all non-draft releases (up to 100); filter by channel
    const releases = await fetchUpstreamReleases(upOwner, upRepo, configured)

    const published = channel === 'beta'
      ? releases.filter((r) => !r.draft)
      : releases.filter((r) => !r.draft && !r.prerelease)
    if (published.length === 0) {
      const result: CoreUpdateStatus = {
        configured: true,
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseNotesHtml: '',
        latestUrl: `https://github.com/${UPSTREAM_REPO}/releases`,
        publishedAt: null,
      }
      _cache.set(channel, { status: result, at: now })
      return result
    }

    // Find the highest version among published releases
    const sorted = [...published].sort((a, b) => compareVersions(b.tag_name, a.tag_name))
    const latest = sorted[0]!
    const latestVersion = latest.tag_name.replace(/^v/, '')
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0

    // Build aggregated release notes for every release newer than current
    let releaseNotesHtml = ''
    if (updateAvailable) {
      const newer = sorted.filter((r) => compareVersions(r.tag_name.replace(/^v/, ''), currentVersion) > 0)
      const parts: string[] = []
      for (const r of newer) {
        if (!r.body?.trim()) continue
        const date = r.published_at ? new Date(r.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
        parts.push(`## ${r.tag_name}${date ? ` — ${date}` : ''}\n\n${r.body}`)
      }
      if (parts.length > 0) {
        releaseNotesHtml = markdownToHtml(parts.join('\n\n---\n\n'))
      }
    }

    const result: CoreUpdateStatus = {
      configured: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseNotesHtml,
      latestUrl: latest.html_url,
      publishedAt: latest.published_at ?? null,
    }
    _cache.set(channel, { status: result, at: now })
    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to check for updates'
    const result: CoreUpdateStatus = configured
      ? { configured: true, error: message }
      : { configured: false }
    _cache.set(channel, { status: result, at: now })
    return result
  }
}

export type SyncResult = {
  commitSha: string
  fromVersion: string
  toVersion: string
  fileCount: number
}

export type ModuleRegistryEntry = { name: string; repoUrl: string; version: string }

// Pure reconciliation planner (drift-proof, unit-tested) lives in its own dependency-free
// module; imported for use below and re-exported so external importers keep one entry point.
import { planCoreSync, isSkippedCorePath, type CoreTreeEntry, type CoreSyncPlan } from './core-plan'
export { planCoreSync, isSkippedCorePath, type CoreTreeEntry, type CoreSyncPlan }

// Reads the admin repo's current main: HEAD sha, base tree sha, a path->blob-sha map of
// every tracked blob, and whether the recursive tree read was truncated.
async function readAdminBase(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string,
): Promise<{ headSha: string; baseTreeSha: string; shaByPath: Map<string, string>; truncated: boolean }> {
  const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: 'heads/main' })
  const headSha = ref.object.sha
  const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha })
  const baseTreeSha = headCommit.tree.sha
  const { data: baseTree } = await octokit.rest.git.getTree({
    owner, repo, tree_sha: baseTreeSha, recursive: 'true',
  })
  const shaByPath = new Map<string, string>()
  for (const e of baseTree.tree) {
    if (e.type === 'blob' && e.path && e.sha) shaByPath.set(e.path, e.sha)
  }
  return { headSha, baseTreeSha, shaByPath, truncated: Boolean(baseTree.truncated) }
}

// Reconciles the admin's core files toward the upstream release (not a replayed diff).
// Skips anything under modules/, .gitmodules, or modules.json.
// Uses createTree(base_tree=adminHEAD) so user files outside core are preserved.
//
// `modulesJson`, when given, pins the module registry to it in the SAME commit as the
// core sync (rather than a separate push) - this is what makes checkout-modules.mjs's
// per-module `--branch <version>` clone (see that script) actually pin module code to
// a specific tag instead of always fetching upstream HEAD on every build the core
// update triggers. Callers pass the full desired module list (untouched modules keep
// their current confirmed version, selected-for-update modules pass their target tag) -
// omitting an installed module here would silently drop its registry entry.
export async function syncCoreFromUpstream(
  fromVersion: string,
  toVersion: string,
  modulesJson?: ModuleRegistryEntry[]
): Promise<SyncResult> {
  const octokit = await getGithubClient()
  const { owner: adminOwner, repo: adminRepo } = getMainRepo()
  const { owner: upOwner, repo: upRepo } = parseRepo(UPSTREAM_REPO)

  const fromTag = fromVersion.startsWith('v') ? fromVersion : `v${fromVersion}`
  const toTag = toVersion.startsWith('v') ? toVersion : `v${toVersion}`

  // Diff the two tags by their tree contents (path + blob sha) rather than via
  // compareCommits: the upstream repo's history was rewritten at one point, so
  // old and new tags can share no common ancestor, which makes GitHub's
  // three-dot compare (and its merge-base requirement) fail outright. A raw
  // tree diff doesn't care about ancestry at all.
  type UpstreamEntry = { sha: string; mode: '100644' | '100755' }
  const getUpstreamTree = async (ref: string): Promise<Map<string, UpstreamEntry>> => {
    const { data } = await octokit.rest.git.getTree({
      owner: upOwner, repo: upRepo, tree_sha: ref, recursive: 'true',
    })
    const map = new Map<string, UpstreamEntry>()
    for (const item of data.tree) {
      if (item.path && item.type === 'blob' && item.sha) {
        map.set(item.path, { sha: item.sha, mode: item.mode === '100755' ? '100755' : '100644' })
      }
    }
    return map
  }

  const fromTree = await getUpstreamTree(fromTag)
  const toTree = await getUpstreamTree(toTag)

  // Read the admin repo's ACTUAL base tree once, up front, and plan the reconcile
  // against it (not against the upstream from-tag). This is what makes the update
  // self-healing: it drives core toward the target from wherever the repo actually is,
  // so drift from a failed update, a user edit, or a version skip is corrected, not
  // tripped over. See planCoreSync.
  const initialBase = await retryTransient(() => readAdminBase(octokit, adminOwner, adminRepo))
  if (initialBase.truncated) {
    console.warn('[core-update] base tree read was truncated - skipping deletions this run')
  }
  const plan = planCoreSync({
    toEntries: toTree,
    fromPaths: new Set(fromTree.keys()),
    baseShaByPath: initialBase.shaByPath,
    baseTruncated: initialBase.truncated,
  })

  // Already at target and no registry pin to write: return a graceful no-op (current
  // HEAD, zero files) instead of throwing, so a re-run after a successful update is calm.
  if (plan.writes.length === 0 && plan.deletes.length === 0 && !modulesJson) {
    return { commitSha: initialBase.headSha, fromVersion, toVersion, fileCount: 0 }
  }

  // Fetch target content for each write. Text is inlined via the tree's `content` field
  // (GitHub makes the blob atomically inside createTree - no replication race); genuinely
  // binary files (inline `content` is UTF-8 only) go through a replication-confirmed blob
  // so createTree never references an unreplicated object.
  type TreeEntry = {
    path: string
    mode: '100644' | '100755'
    type: 'blob'
    sha?: string | null
    content?: string
  }
  const treeEntries: TreeEntry[] = []
  for (const w of plan.writes) {
    // getBlob (unlike getContent) has no 1 MB ceiling, so large files aren't dropped.
    const { data: upstreamBlob } = await retryTransient(() =>
      octokit.rest.git.getBlob({ owner: upOwner, repo: upRepo, file_sha: w.sha }),
    )
    const bytes = Buffer.from(upstreamBlob.content, upstreamBlob.encoding === 'base64' ? 'base64' : 'utf8')
    if (bytes.includes(0)) {
      const sha = await createReplicatedBlob(octokit, {
        owner: adminOwner, repo: adminRepo,
        content: bytes.toString('base64'),
        encoding: 'base64',
      })
      treeEntries.push({ path: w.path, mode: w.mode, type: 'blob', sha })
    } else {
      treeEntries.push({ path: w.path, mode: w.mode, type: 'blob', content: bytes.toString('utf8') })
    }
  }

  if (modulesJson) {
    // JSON is text, so inline it too - no separate blob, no race.
    const jsonContent = JSON.stringify({ modules: modulesJson }, null, 2) + '\n'
    treeEntries.push({ path: 'modules.json', mode: '100644', type: 'blob', content: jsonContent })
  }

  // adds/modifies for the user-facing count (deletions carry sha === null, excluded).
  const fileCount = treeEntries.filter((e) => e.content !== undefined || typeof e.sha === 'string').length

  // Write it all as one retryable, idempotent transaction. Each attempt re-reads admin
  // HEAD and rebuilds the commit on the CURRENT base, so a transient BadObjectState / 5xx
  // is absorbed and a moved HEAD (concurrent push, or a prior half-applied attempt)
  // rebases instead of failing non-fast-forward. Deletions are re-checked against the
  // fresh base each attempt - a sha: null for an absent path is the one thing createTree
  // refuses. Every attempt converges to the same target, so re-running is always safe.
  let commitSha: string
  try {
    commitSha = await retryTransient(async () => {
      const base = await readAdminBase(octokit, adminOwner, adminRepo)
      const finalTree: TreeEntry[] = [
        ...treeEntries,
        ...plan.deletes
          .filter((path) => base.shaByPath.has(path))
          .map((path) => ({ path, mode: '100644' as const, type: 'blob' as const, sha: null })),
      ]

      const { data: newTree } = await octokit.rest.git.createTree({
        owner: adminOwner, repo: adminRepo,
        base_tree: base.baseTreeSha,
        tree: finalTree,
      })
      const { data: newCommit } = await octokit.rest.git.createCommit({
        owner: adminOwner, repo: adminRepo,
        message: `chore: update Cactus Foundation to v${toVersion}\n\n[cactus-core-update]`,
        tree: newTree.sha,
        parents: [base.headSha],
      })
      await octokit.rest.git.updateRef({
        owner: adminOwner, repo: adminRepo, ref: 'heads/main', sha: newCommit.sha,
      })
      return newCommit.sha
    })
  } catch (err) {
    // Surface enough context that an at-scale failure is reportable without repo access.
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Core update push failed (${fromVersion} -> ${toVersion}: ${treeEntries.length} writes, up to ${plan.deletes.length} deletions): ${detail}`,
    )
  }

  return { commitSha, fromVersion, toVersion, fileCount }
}

export function invalidateCoreUpdateCache() {
  _cache.clear()
}
