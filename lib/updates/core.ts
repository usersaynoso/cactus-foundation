// Core update library: compares this install against the upstream Cactus Foundation
// repo and can sync changed core files into the admin's own GitHub repo via the
// Git Data API (createBlob → createTree → createCommit → updateRef).
// Modules, .gitmodules, and user content are never touched.

import { Octokit } from '@octokit/rest'
import pkg from '@/package.json'
import { getGithubClient } from '@/lib/github/client'
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

function isBadObjectState(err: unknown): boolean {
  return err instanceof Error && err.message.includes('BadObjectState')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// GitHub's Git Data API sometimes hasn't finished replicating blobs created
// moments earlier, which surfaces as GitRPC::BadObjectState on the following
// createTree call. Text files now go in via inline `content` (no separate blob to
// replicate), so this only guards the residual binary-blob path - but binaries can
// still lag, so keep a generous backoff (1+2+4+8+16 = 31s over 6 tries).
async function retryOnBadObjectState<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (!isBadObjectState(err) || i === attempts - 1) throw err
      await sleep(1000 * 2 ** i)
    }
  }
  throw new Error('unreachable')
}

export type SyncResult = {
  commitSha: string
  fromVersion: string
  toVersion: string
  fileCount: number
}

export type ModuleRegistryEntry = { name: string; repoUrl: string; version: string }

// Copies changed core files from the upstream release into the admin's repo.
// Skips anything under modules/, .gitmodules, or modules.json.
// Uses createTree(base_tree=adminHEAD) so user files outside the delta are preserved.
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

  // Get admin repo HEAD
  const { data: ref } = await octokit.rest.git.getRef({ owner: adminOwner, repo: adminRepo, ref: 'heads/main' })
  const headSha = ref.object.sha
  const { data: headCommit } = await octokit.rest.git.getCommit({ owner: adminOwner, repo: adminRepo, commit_sha: headSha })
  const baseTreeSha = headCommit.tree.sha

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

  // Build tree entries, skipping modules/ and .gitmodules. Text files are inlined
  // via the tree's `content` field so GitHub creates their blobs atomically as part
  // of the single createTree write. This sidesteps the createBlob -> createTree
  // replication race that surfaced as GitRPC::BadObjectState: a blob created moments
  // earlier is not always visible to the immediately following createTree, and the
  // whole tree is atomic, so one lagging blob out of a large delta fails everything.
  // Only genuinely binary files (which can't be inlined as UTF-8) still go through
  // createBlob, shrinking the race window to the rare image/font in a delta.
  type TreeEntry = {
    path: string
    mode: '100644' | '100755'
    type: 'blob'
    sha?: string | null
    content?: string
  }

  const treeEntries: TreeEntry[] = []
  const skipped = (path: string) => path === '.gitmodules' || path === 'modules.json' || path.startsWith('modules/')

  for (const [path, toEntry] of toTree) {
    if (skipped(path)) continue
    const fromEntry = fromTree.get(path)
    if (fromEntry && fromEntry.sha === toEntry.sha) continue // unchanged

    // Read the file's bytes from upstream by blob sha. getBlob (unlike getContent)
    // has no 1 MB ceiling, so large changed files are no longer silently dropped.
    const { data: upstreamBlob } = await octokit.rest.git.getBlob({
      owner: upOwner, repo: upRepo, file_sha: toEntry.sha,
    })
    const bytes = Buffer.from(upstreamBlob.content, upstreamBlob.encoding === 'base64' ? 'base64' : 'utf8')

    // A null byte means binary: inline `content` is UTF-8 only and would corrupt it,
    // so create a real blob and reference it by sha (covered by the retry below).
    if (bytes.includes(0)) {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner: adminOwner, repo: adminRepo,
        content: bytes.toString('base64'),
        encoding: 'base64',
      })
      treeEntries.push({ path, mode: toEntry.mode, type: 'blob', sha: blob.sha })
    } else {
      treeEntries.push({ path, mode: toEntry.mode, type: 'blob', content: bytes.toString('utf8') })
    }
  }

  for (const path of fromTree.keys()) {
    if (skipped(path) || toTree.has(path)) continue
    treeEntries.push({ path, mode: '100644', type: 'blob', sha: null })
  }

  if (modulesJson) {
    // JSON is text, so inline it too - no separate blob, no race.
    const jsonContent = JSON.stringify({ modules: modulesJson }, null, 2) + '\n'
    treeEntries.push({ path: 'modules.json', mode: '100644', type: 'blob', content: jsonContent })
  }

  if (treeEntries.length === 0) {
    throw new Error('No core files changed between these versions')
  }

  // Count adds/modifies (inlined text carries `content`; binary carries a real `sha`)
  // for the user-facing count. Deletions carry sha === null and are excluded.
  const fileCount = treeEntries.filter((e) => e.content !== undefined || typeof e.sha === 'string').length

  // Any binary blobs created just above can lag GitHub's storage replication by a
  // second or two, which makes an immediate createTree fail with GitRPC::BadObjectState
  // even though the blobs are valid. Retry with backoff before giving up. (Text files
  // are inlined into the tree, so they don't hit this at all.)
  const newTree = await retryOnBadObjectState(() =>
    octokit.rest.git.createTree({
      owner: adminOwner, repo: adminRepo,
      base_tree: baseTreeSha,
      tree: treeEntries,
    })
  ).then((r) => r.data)

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner: adminOwner, repo: adminRepo,
    message: `chore: update Cactus Foundation to v${toVersion}\n\n[cactus-core-update]`,
    tree: newTree.sha,
    parents: [headSha],
  })

  await octokit.rest.git.updateRef({
    owner: adminOwner, repo: adminRepo, ref: 'heads/main', sha: newCommit.sha,
  })

  return { commitSha: newCommit.sha, fromVersion, toVersion, fileCount }
}

export function invalidateCoreUpdateCache() {
  _cache.clear()
}
