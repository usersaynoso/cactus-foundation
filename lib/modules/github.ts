// GitHub Git Data API integration for module install, update, and removal.
// Uses @octokit/rest — never shells out to git CLI.
// Module registry is stored in modules.json at the repo root (plain JSON, no git submodule machinery).

import { parseGitHubRepo } from './manifest'
import { getGithubClient } from '@/lib/github/client'
import { retryTransient, createReplicatedBlob } from '@/lib/github/retry'
import { applyPinFloor, formatHeldPins } from './pin-floor'
import { buildVercelJson, VERCEL_JSON_PATH } from '@/lib/cron/vercel-file'
import { resolveDispatchSchedule } from '@/lib/cron/jobs'

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
  // Input to applyPinFloor only - never written to the registry file.
  lastFailedVersion?: string | null
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

// Reads a small text file from the repo, or null when it isn't there yet.
async function readRepoTextFile(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path })
    if ('content' in data) return Buffer.from(data.content, 'base64').toString('utf8')
  } catch {
    // Not present.
  }
  return null
}

async function commitModulesJson(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string,
  updated: ModulesJson,
  message: string,
  deleteGitmodules = false,
  extraFiles: Array<{ path: string; content: string }> = []
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

  // Same replication guarantee as modules.json above: the blob is confirmed present
  // before createTree is allowed to reference it.
  for (const file of extraFiles) {
    const sha = await createReplicatedBlob(octokit, {
      owner, repo,
      content: Buffer.from(file.content).toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha })
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

  // The desired list comes from the Module table, which can be behind what the repo
  // already pins (a pin moved in git is not something the database hears about). Writing
  // it as-is downgrades that pin silently - see pin-floor.ts for the case that cost a
  // live site two failed deploys.
  const { entries: floored, held } = applyPinFloor(desired, content.modules)
  if (held.length > 0) console.warn(`[modules] ${formatHeldPins(held)}`)

  // vercel.json has to BE in the commit Vercel builds, because that is when Vercel reads
  // it - a file the build generates is a file nothing registers. Checked here rather than
  // in a migration because it is the repository, not the database, that is missing it.
  //
  // Its one entry is the dispatcher tick, which is derived from the schedules this site
  // is actually running (lib/cron/jobs.ts). Installing a module with a five-minute job,
  // or removing the last one, therefore moves the tick in the same commit that moves the
  // module registry - which is the only commit either of them gets.
  const desiredVercelJson = buildVercelJson(await resolveDispatchSchedule())
  const currentVercelJson = await readRepoTextFile(octokit, owner, repo, VERCEL_JSON_PATH)
  const vercelJsonStale = currentVercelJson !== desiredVercelJson

  if (normaliseModules(content.modules) === normaliseModules(floored) && !vercelJsonStale) {
    return { committed: false }
  }

  // Sorted by name, because the order this arrives in is whatever the Module table's
  // findMany happened to return - physical row order, which shuffles as rows are
  // updated. Every sync therefore rewrote the whole file in a fresh order, and
  // `git log -p modules.json` showed twenty modules moving about with the one real
  // version bump buried among them. That history is exactly what you reach for when
  // asking "did that module actually update?", and it was unreadable. normaliseModules
  // already sorts before comparing, so this only changes what is written, never
  // whether a commit happens.
  const updated: ModulesJson = {
    modules: [...floored]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({ name: m.name, repoUrl: m.repoUrl, version: m.version })),
  }
  const deleteGitmodules = await hasGitmodules(octokit, owner, repo)
  const { commitSha } = await commitModulesJson(
    octokit,
    owner,
    repo,
    updated,
    'chore: sync module registry\n\n[cactus-deploy]',
    deleteGitmodules,
    vercelJsonStale ? [{ path: VERCEL_JSON_PATH, content: desiredVercelJson }] : []
  )
  return { committed: true, commitSha }
}

function readyStateToStatus(state: string | undefined): 'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN' {
  if (state === 'READY') return 'READY'
  if (state === 'ERROR' || state === 'CANCELED') return 'ERROR'
  if (state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING') return 'BUILDING'
  return 'UNKNOWN'
}

// Status of the deploy we actually triggered, where we know which one that was.
//
// Taking the project's newest deployment (limit=1) is a misattribution waiting to
// happen: anyone else pushing to main, a preview build, or a rollback lands a
// newer deployment than ours, and the install flow then reports that stranger's
// success or failure as its own. An install can be declared finished off the back
// of an unrelated build, or marked failed because someone else's push broke.
//
// The specific id is already captured and parked on SiteConfig.pendingRedeployId
// by lib/deploy/redeploy.ts, so prefer it. 'pending' is the sentinel meaning "we
// triggered something but have not resolved its id yet" - not a real id, so it
// falls through to the latest-deployment behaviour, which is the best available
// answer during that window.
export async function getLatestDeploymentStatus(
  deploymentId?: string | null
): Promise<'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN'> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return 'UNKNOWN'

  const headers = { Authorization: `Bearer ${token}` }

  try {
    if (deploymentId && deploymentId !== 'pending') {
      const res = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) {
        const data = (await res.json()) as { readyState?: string; status?: string }
        return readyStateToStatus(data.readyState ?? data.status)
      }
      // A 404 means the id is stale or from another project. Fall through rather
      // than reporting UNKNOWN forever.
    }

    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
      { headers, signal: AbortSignal.timeout(10_000) }
    )
    if (!res.ok) return 'UNKNOWN'
    const data = (await res.json()) as {
      deployments?: Array<{ readyState: string }>
    }
    return readyStateToStatus(data.deployments?.[0]?.readyState)
  } catch {
    return 'UNKNOWN'
  }
}

// Write vercel.json on its own, when the tick the site needs has changed but nothing
// else has - which is what happens when an admin picks a new frequency for a job.
//
// Vercel reads vercel.json when it CREATES a deployment, so a tick change is not a
// setting that takes effect on save: it takes effect on the next deploy, and this is
// what causes one. modules.json is written back exactly as found, so the commit carries
// the cron file and nothing else.
export async function syncVercelJson(): Promise<{ committed: boolean; commitSha?: string }> {
  const desiredVercelJson = buildVercelJson(await resolveDispatchSchedule())

  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const currentVercelJson = await readRepoTextFile(octokit, owner, repo, VERCEL_JSON_PATH)
  if (currentVercelJson === desiredVercelJson) return { committed: false }

  const { content } = await readModulesJson(octokit, owner, repo)
  const { commitSha } = await commitModulesJson(
    octokit,
    owner,
    repo,
    content,
    'chore: update the scheduled job tick\n\n[cactus-deploy]',
    false,
    [{ path: VERCEL_JSON_PATH, content: desiredVercelJson }]
  )
  return { committed: true, commitSha }
}
