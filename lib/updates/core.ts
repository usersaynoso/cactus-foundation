// Core update library: compares this install against the upstream Cactus Foundation
// repo and can sync changed core files into the admin's own GitHub repo via the
// Git Data API (createBlob → createTree → createCommit → updateRef).
// Modules, .gitmodules, and user content are never touched.

import pkg from '@/package.json'
import { getGithubClient } from '@/lib/github/client'
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
  | { configured: false; error?: string }
  | {
      configured: true
      currentVersion: string
      latestVersion: string
      updateAvailable: boolean
      releaseNotesHtml: string
      latestUrl: string
      publishedAt: string | null
    }

// In-memory cache: ~10 min TTL so the panel does not hit GitHub on every load.
let _cachedStatus: CoreUpdateStatus | null = null
let _cachedAt = 0
const CACHE_TTL_MS = 10 * 60_000

export async function getCoreUpdateStatus(opts?: { bust?: boolean }): Promise<CoreUpdateStatus> {
  const now = Date.now()
  if (!opts?.bust && _cachedStatus && now - _cachedAt < CACHE_TTL_MS) {
    return _cachedStatus
  }

  const currentVersion = pkg.version
  const { owner: upOwner, repo: upRepo } = parseRepo(UPSTREAM_REPO)

  let octokit
  try {
    octokit = await getGithubClient()
  } catch {
    const result: CoreUpdateStatus = { configured: false, error: 'GitHub is not configured' }
    _cachedStatus = result
    _cachedAt = now
    return result
  }

  try {
    // Fetch all non-draft, non-prerelease releases (up to 100)
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner: upOwner, repo: upRepo, per_page: 100,
    })

    const published = releases.filter((r) => !r.draft && !r.prerelease)
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
      _cachedStatus = result
      _cachedAt = now
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
    _cachedStatus = result
    _cachedAt = now
    return result
  } catch (err: unknown) {
    const result: CoreUpdateStatus = {
      configured: false,
      error: err instanceof Error ? err.message : 'Failed to check for updates',
    }
    _cachedStatus = result
    _cachedAt = now
    return result
  }
}

export type SyncResult = {
  commitSha: string
  fromVersion: string
  toVersion: string
  fileCount: number
}

// Copies changed core files from the upstream release into the admin's repo.
// Skips anything under modules/ or equal to .gitmodules.
// Uses createTree(base_tree=adminHEAD) so user files outside the delta are preserved.
export async function syncCoreFromUpstream(
  fromVersion: string,
  toVersion: string
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

  // Collect changed files between fromTag and toTag on upstream, with pagination
  const allFiles: Array<{ filename: string; status: string; previous_filename?: string }> = []
  let page = 1
  while (true) {
    const { data: compare } = await octokit.rest.repos.compareCommits({
      owner: upOwner, repo: upRepo, base: fromTag, head: toTag, per_page: 100, page,
    })
    const batch = compare.files ?? []
    allFiles.push(...batch)
    if (batch.length < 100) break
    page++
  }

  // Build tree entries, skipping modules/ and .gitmodules
  type TreeEntry = {
    path: string
    mode: '100644' | '100755'
    type: 'blob'
    sha: string | null
  }

  const treeEntries: TreeEntry[] = []
  const skipped = (path: string) => path === '.gitmodules' || path.startsWith('modules/')

  // Fetch the upstream tree at toTag to get file modes
  const modeMap = new Map<string, '100644' | '100755'>()
  try {
    const { data: tree } = await octokit.rest.git.getTree({
      owner: upOwner, repo: upRepo, tree_sha: toTag, recursive: 'true',
    })
    for (const item of tree.tree) {
      if (item.path && item.type === 'blob') {
        modeMap.set(item.path, item.mode === '100755' ? '100755' : '100644')
      }
    }
  } catch {
    // If we can't get the tree, default to 100644 for all files
  }

  for (const file of allFiles) {
    const path = file.filename
    if (skipped(path)) continue

    if (file.status === 'removed') {
      treeEntries.push({ path, mode: '100644', type: 'blob', sha: null })
      continue
    }

    // For renamed files: delete the old path
    if (file.status === 'renamed' && file.previous_filename && !skipped(file.previous_filename)) {
      treeEntries.push({ path: file.previous_filename, mode: '100644', type: 'blob', sha: null })
    }

    // Fetch content from upstream at toTag and create blob in admin repo
    const { data: content } = await octokit.rest.repos.getContent({
      owner: upOwner, repo: upRepo, path, ref: toTag,
    })
    if (!('content' in content) || !content.content) continue

    const { data: blob } = await octokit.rest.git.createBlob({
      owner: adminOwner, repo: adminRepo,
      content: content.content.replace(/\n/g, ''),
      encoding: 'base64',
    })

    const mode = modeMap.get(path) ?? '100644'
    treeEntries.push({ path, mode, type: 'blob', sha: blob.sha })
  }

  if (treeEntries.length === 0) {
    throw new Error('No core files changed between these versions')
  }

  // Count only adds/modifies/renames (not deletes) for the user-facing count
  const fileCount = treeEntries.filter((e) => e.sha !== null).length

  const { data: newTree } = await octokit.rest.git.createTree({
    owner: adminOwner, repo: adminRepo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  })

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
  _cachedStatus = null
  _cachedAt = 0
}
