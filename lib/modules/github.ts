// GitHub Git Data API integration for module install, update, and removal.
// Uses @octokit/rest — never shells out to git CLI.
// Module registry is stored in modules.json at the repo root (plain JSON, no git submodule machinery).

import { parseGitHubRepo } from './manifest'
import { getGithubClient } from '@/lib/github/client'
import { retryTransient, createReplicatedBlob } from '@/lib/github/retry'

function getMainRepo(): { owner: string; repo: string } {
  const raw = process.env.GITHUB_REPO ?? ''
  const [owner, repo] = raw.split('/')
  if (!owner || !repo) {
    throw new Error('GITHUB_REPO environment variable must be set as "owner/repo"')
  }
  return { owner, repo }
}

async function resolveTagToCommit(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string,
  tagName: string,
): Promise<string> {
  const tagRef = await octokit.rest.git.getRef({ owner, repo, ref: `tags/${tagName}` })
  const tagSha = tagRef.data.object.sha
  if (tagRef.data.object.type === 'tag') {
    const tag = await octokit.rest.git.getTag({ owner, repo, tag_sha: tagSha })
    return tag.data.object.sha
  }
  return tagSha
}

export async function getLatestRelease(
  repoUrl: string,
  channel: 'public' | 'beta' = 'public',
): Promise<{ tag: string; sha: string; body: string | null } | null> {
  const octokit = await getGithubClient()
  const { owner, repo } = parseGitHubRepo(repoUrl)

  try {
    if (channel === 'beta') {
      // Fetch all non-draft releases and pick the newest by tag (pre-releases included)
      const { data: releases } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 100 })
      const candidates = releases.filter((r) => !r.draft)
      if (candidates.length === 0) return null
      // Sort descending by published date to pick the most recently published
      candidates.sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())
      const latest = candidates[0]!
      const commitSha = await resolveTagToCommit(octokit, owner, repo, latest.tag_name)
      return { tag: latest.tag_name, sha: commitSha, body: latest.body ?? null }
    }

    // Public channel: use the GitHub "latest release" API (stable only, no pre-releases)
    const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo })
    const commitSha = await resolveTagToCommit(octokit, owner, repo, data.tag_name)
    return { tag: data.tag_name, sha: commitSha, body: data.body ?? null }
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) return null
    throw err
  }
}

interface ModuleEntry {
  name: string
  repoUrl: string
  version: string
}

interface ModulesJson {
  modules: ModuleEntry[]
}

async function readModulesJson(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string
): Promise<{ content: ModulesJson; fileSha: string | null }> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: 'modules.json' })
    if ('content' in data) {
      const parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) as ModulesJson
      return { content: parsed, fileSha: data.sha }
    }
  } catch {
    // File doesn't exist yet
  }
  return { content: { modules: [] }, fileSha: null }
}

async function commitModulesJson(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string,
  updated: ModulesJson,
  message: string,
  deleteGitmodules = false
): Promise<{ commitSha: string }> {
  const jsonContent = JSON.stringify(updated, null, 2) + '\n'
  // Confirm the blob has replicated before it's referenced in the tree, closing the
  // createBlob->createTree BadObjectState race at the source.
  const blobSha = await createReplicatedBlob(octokit, {
    owner, repo,
    content: Buffer.from(jsonContent).toString('base64'),
    encoding: 'base64',
  })

  const treeItems: Array<{
    path: string
    mode: '100644' | '160000' | '040000' | '100755' | '120000'
    type: 'blob' | 'tree' | 'commit'
    sha: string | null
  }> = [
    { path: 'modules.json', mode: '100644', type: 'blob', sha: blobSha },
  ]

  if (deleteGitmodules) {
    treeItems.push({ path: '.gitmodules', mode: '100644', type: 'blob', sha: null })
  }

  // One retryable, idempotent transaction: re-read HEAD each attempt and rebuild the
  // commit on the current base, so a transient Git Data API error or a HEAD race is
  // absorbed rather than surfaced (same guarantee as the core-update sync).
  const commitSha = await retryTransient(async () => {
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: 'heads/main' })
    const headSha = ref.object.sha
    const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha })
    const baseTreeSha = headCommit.tree.sha

    const { data: newTree } = await octokit.rest.git.createTree({
      owner, repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    })

    const { data: newCommit } = await octokit.rest.git.createCommit({
      owner, repo,
      message,
      tree: newTree.sha,
      parents: [headSha],
    })

    await octokit.rest.git.updateRef({ owner, repo, ref: 'heads/main', sha: newCommit.sha })

    return newCommit.sha
  })

  return { commitSha }
}

async function hasGitmodules(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path: '.gitmodules' })
    return true
  } catch {
    return false
  }
}

// Normalise a modules list to a stable JSON string for comparison: sorted by name,
// only the persisted fields, so cosmetic ordering differences never force a commit.
function normaliseModules(modules: ModuleEntry[]): string {
  const sorted = [...modules]
    .map((m) => ({ name: m.name, repoUrl: m.repoUrl, version: m.version }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return JSON.stringify(sorted)
}

// Deferred module registry sync. Commits modules.json to main only when the desired
// state (derived from the DB) differs from what's already in git. Returns whether a
// commit was made so the caller knows if a Vercel build was triggered by the push.
// An identical state is a no-op — critical so env-only redeploys don't create an
// empty commit and a spurious build.
export async function syncModulesJson(
  desired: ModuleEntry[]
): Promise<{ committed: boolean; commitSha?: string }> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const { content } = await readModulesJson(octokit, owner, repo)
  if (normaliseModules(content.modules) === normaliseModules(desired)) {
    return { committed: false }
  }

  const updated: ModulesJson = {
    modules: desired.map((m) => ({ name: m.name, repoUrl: m.repoUrl, version: m.version })),
  }
  const deleteGitmodules = await hasGitmodules(octokit, owner, repo)
  const { commitSha } = await commitModulesJson(
    octokit,
    owner,
    repo,
    updated,
    'chore: sync module registry\n\n[cactus-deploy]',
    deleteGitmodules
  )
  return { committed: true, commitSha }
}

export async function getLatestDeploymentStatus(): Promise<
  'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN'
> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return 'UNKNOWN'

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!res.ok) return 'UNKNOWN'
    const data = (await res.json()) as {
      deployments?: Array<{ readyState: string }>
    }
    const state = data.deployments?.[0]?.readyState
    if (state === 'READY') return 'READY'
    if (state === 'ERROR' || state === 'CANCELED') return 'ERROR'
    if (state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING') return 'BUILDING'
    return 'UNKNOWN'
  } catch {
    return 'UNKNOWN'
  }
}
