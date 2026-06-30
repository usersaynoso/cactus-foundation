// GitHub Git Data API integration for module/theme install and update.
// Uses @octokit/rest — never shells out to git CLI.
// Installs/updates work by committing a submodule reference (gitlink, mode 160000)
// plus the .gitmodules entry via createTree + createCommit + updateRef.

import { parseGitHubRepo } from './manifest'
import { getGithubClient } from '@/lib/github/client'

// Parse the MAIN repo (where submodules are committed) from GITHUB_REPO env var.
// Format: "owner/repo"
function getMainRepo(): { owner: string; repo: string } {
  const raw = process.env.GITHUB_REPO ?? ''
  const [owner, repo] = raw.split('/')
  if (!owner || !repo) {
    throw new Error('GITHUB_REPO environment variable must be set as "owner/repo"')
  }
  return { owner, repo }
}

// Fetch the latest tagged release SHA for a repo.
// Returns { tag, sha } or null if no releases.
export async function getLatestRelease(
  repoUrl: string
): Promise<{ tag: string; sha: string; body: string | null } | null> {
  const octokit = await getGithubClient()
  const { owner, repo } = parseGitHubRepo(repoUrl)

  try {
    const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo })
    // Get the commit SHA for the tag
    const tagRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${data.tag_name}`,
    })
    const tagSha = tagRef.data.object.sha
    // If tag is an annotated tag object, dereference it
    let commitSha = tagSha
    if (tagRef.data.object.type === 'tag') {
      const tag = await octokit.rest.git.getTag({ owner, repo, tag_sha: tagSha })
      commitSha = tag.data.object.sha
    }
    return { tag: data.tag_name, sha: commitSha, body: data.body ?? null }
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) return null
    throw err
  }
}

// Commit a new submodule to the main repo using the Git Data API.
// This is how an "install" works:
//   1. Get the current HEAD commit and tree.
//   2. Create a new tree that adds the gitlink (mode 160000) and .gitmodules entry.
//   3. Create a new commit.
//   4. Update the branch ref.
export async function commitSubmoduleAdd(params: {
  submodulePath: string  // e.g. "modules/my-forum"
  submoduleUrl: string   // e.g. "https://github.com/user/my-forum"
  commitSha: string      // the commit SHA to pin the submodule to
  message: string
}): Promise<{ commitSha: string }> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  // Get current HEAD
  const { data: ref } = await octokit.rest.git.getRef({
    owner, repo, ref: 'heads/main',
  })
  const headSha = ref.object.sha

  const { data: headCommit } = await octokit.rest.git.getCommit({
    owner, repo, commit_sha: headSha,
  })
  const baseTreeSha = headCommit.tree.sha

  // Read current .gitmodules (if any)
  let currentGitmodules = ''
  try {
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner, repo, path: '.gitmodules',
    })
    if ('content' in fileData) {
      currentGitmodules = Buffer.from(fileData.content, 'base64').toString('utf8')
    }
  } catch {
    // .gitmodules doesn't exist yet — start fresh
  }

  const newEntry = [
    `[submodule "${params.submodulePath}"]`,
    `\tpath = ${params.submodulePath}`,
    `\turl = ${params.submoduleUrl}`,
  ].join('\n')

  const updatedGitmodules = currentGitmodules.trimEnd()
    ? `${currentGitmodules.trimEnd()}\n\n${newEntry}\n`
    : `${newEntry}\n`

  // Create blob for .gitmodules
  const { data: blob } = await octokit.rest.git.createBlob({
    owner, repo,
    content: Buffer.from(updatedGitmodules).toString('base64'),
    encoding: 'base64',
  })

  // Create tree with gitlink + updated .gitmodules
  const { data: newTree } = await octokit.rest.git.createTree({
    owner, repo,
    base_tree: baseTreeSha,
    tree: [
      {
        path: params.submodulePath,
        mode: '160000', // gitlink
        type: 'commit',
        sha: params.commitSha,
      },
      {
        path: '.gitmodules',
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      },
    ],
  })

  // Create commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner, repo,
    message: params.message,
    tree: newTree.sha,
    parents: [headSha],
  })

  // Update branch ref
  await octokit.rest.git.updateRef({
    owner, repo,
    ref: 'heads/main',
    sha: newCommit.sha,
  })

  return { commitSha: newCommit.sha }
}

// Update an existing submodule to a new commit SHA.
export async function commitSubmoduleUpdate(params: {
  submodulePath: string
  commitSha: string
  message: string
}): Promise<{ commitSha: string }> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const { data: ref } = await octokit.rest.git.getRef({
    owner, repo, ref: 'heads/main',
  })
  const headSha = ref.object.sha
  const { data: headCommit } = await octokit.rest.git.getCommit({
    owner, repo, commit_sha: headSha,
  })

  const { data: newTree } = await octokit.rest.git.createTree({
    owner, repo,
    base_tree: headCommit.tree.sha,
    tree: [
      {
        path: params.submodulePath,
        mode: '160000',
        type: 'commit',
        sha: params.commitSha,
      },
    ],
  })

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner, repo,
    message: params.message,
    tree: newTree.sha,
    parents: [headSha],
  })

  await octokit.rest.git.updateRef({
    owner, repo,
    ref: 'heads/main',
    sha: newCommit.sha,
  })

  return { commitSha: newCommit.sha }
}

// Remove an existing submodule from the main repo.
// Deletes the gitlink entry and rewrites .gitmodules without the removed entry.
export async function commitSubmoduleRemove(params: {
  submodulePath: string
  message: string
}): Promise<void> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const { data: ref } = await octokit.rest.git.getRef({
    owner, repo, ref: 'heads/main',
  })
  const headSha = ref.object.sha

  const { data: headCommit } = await octokit.rest.git.getCommit({
    owner, repo, commit_sha: headSha,
  })
  const baseTreeSha = headCommit.tree.sha

  // Read current .gitmodules and strip the entry for this submodule
  let updatedGitmodules = ''
  try {
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner, repo, path: '.gitmodules',
    })
    if ('content' in fileData) {
      const current = Buffer.from(fileData.content, 'base64').toString('utf8')
      // Remove the block for this submodule (from [submodule "path"] to the next blank line or EOF)
      updatedGitmodules = current
        .replace(
          new RegExp(
            `\\[submodule "${params.submodulePath}"\\][^\\[]*`,
            'g'
          ),
          ''
        )
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (updatedGitmodules) updatedGitmodules += '\n'
    }
  } catch {
    // .gitmodules missing — nothing to rewrite
  }

  const treeItems: Array<{
    path: string
    mode: '100644' | '160000' | '040000' | '100755' | '100664' | '120000'
    type: 'blob' | 'tree' | 'commit'
    sha: string | null
  }> = [
    // Deleting a gitlink: set sha to null
    { path: params.submodulePath, mode: '160000', type: 'commit', sha: null },
  ]

  if (updatedGitmodules) {
    const { data: blob } = await octokit.rest.git.createBlob({
      owner, repo,
      content: Buffer.from(updatedGitmodules).toString('base64'),
      encoding: 'base64',
    })
    treeItems.push({ path: '.gitmodules', mode: '100644', type: 'blob', sha: blob.sha })
  } else {
    // No entries left — delete .gitmodules entirely
    treeItems.push({ path: '.gitmodules', mode: '100644', type: 'blob', sha: null })
  }

  const { data: newTree } = await octokit.rest.git.createTree({
    owner, repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  })

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner, repo,
    message: params.message,
    tree: newTree.sha,
    parents: [headSha],
  })

  await octokit.rest.git.updateRef({
    owner, repo,
    ref: 'heads/main',
    sha: newCommit.sha,
  })
}

// Check the Vercel deployments API to see if the latest deployment succeeded.
// Used as a fallback when webhooks aren't configured (Hobby plan).
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
