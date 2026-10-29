import { getGithubClient } from '@/lib/github/client'
import type { HostingCredentials } from '@/lib/hosting/provider'
import type { RedeployResult } from '@/lib/hosting/deploy'
import { parseTarball } from '@/lib/vercel/tarball'
import { deployVercelFiles } from '@/lib/vercel/upload-deploy'

// Builds the site's repository as it stands on main by uploading its files, for a
// Vercel project with no Git link. Cactus has just committed to main (a core update,
// a module registry sync); nothing on Vercel is watching the repo, so this does what
// `vercel deploy --prod` from a fresh checkout would: fetch the commit's tree as one
// tarball and hand the files to Vercel.
//
// Pinned to the commit sha read here, not "whatever main is when Vercel gets round to
// it", so the deployment records exactly which commit it carries.

function getMainRepo(): { owner: string; repo: string } {
  const raw = process.env.GITHUB_REPO ?? ''
  const [owner, repo] = raw.split('/')
  if (!owner || !repo) throw new Error('GITHUB_REPO environment variable must be set as "owner/repo"')
  return { owner, repo }
}

export async function deployMainByUpload(creds: HostingCredentials): Promise<RedeployResult> {
  if (creds.provider !== 'vercel') {
    return { triggered: false, error: 'Upload deploys are only for Vercel projects' }
  }
  try {
    const octokit = await getGithubClient()
    const { owner, repo } = getMainRepo()
    const { data: commit } = await octokit.rest.repos.getCommit({ owner, repo, ref: 'main' })
    const archive = await octokit.rest.repos.downloadTarballArchive({ owner, repo, ref: commit.sha })
    const files = parseTarball(Buffer.from(archive.data as ArrayBuffer))
    return await deployVercelFiles(creds.token, creds.siteId, files, {
      commitSha: commit.sha,
      commitRef: 'main',
      commitMessage: commit.commit.message.split('\n')[0],
      remoteUrl: `https://github.com/${owner}/${repo}`,
    })
  } catch (err: unknown) {
    return { triggered: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
