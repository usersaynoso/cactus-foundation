#!/usr/bin/env node
import { Octokit } from '@octokit/rest'
import { writeFile } from 'fs/promises'
import { join } from 'path'

const token = process.env.GITHUB_API_TOKEN
const sourceRepo = process.env.WIKI_SOURCE_REPO || process.env.GITHUB_REPO

if (!sourceRepo) {
  console.error('[sync-wiki] GITHUB_REPO (or WIKI_SOURCE_REPO) must be set')
  process.exit(1)
}

const [owner, repo] = sourceRepo.split('/')
if (!owner || !repo) {
  console.error(`[sync-wiki] Invalid repo format "${sourceRepo}" — expected owner/repo`)
  process.exit(1)
}

const wikiRepo = `${repo}.wiki`
const octokit = new Octokit({ auth: token })
const wikiDir = join(process.cwd(), 'wiki')

async function run() {
  console.log(`[sync-wiki] Syncing wiki from ${owner}/${wikiRepo}`)

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo: wikiRepo,
    ref: 'heads/master',
  })
  const commitSha = ref.object.sha

  const { data: commit } = await octokit.git.getCommit({
    owner,
    repo: wikiRepo,
    commit_sha: commitSha,
  })

  const { data: tree } = await octokit.git.getTree({
    owner,
    repo: wikiRepo,
    tree_sha: commit.tree.sha,
    recursive: '1',
  })

  const mdFiles = tree.tree.filter((f) => f.type === 'blob' && f.path.endsWith('.md'))

  if (mdFiles.length === 0) {
    console.log('[sync-wiki] No .md files found in wiki repo.')
    return
  }

  for (const file of mdFiles) {
    const { data: blob } = await octokit.git.getBlob({
      owner,
      repo: wikiRepo,
      file_sha: file.sha,
    })

    const content = Buffer.from(blob.content, 'base64').toString('utf8')
    const dest = join(wikiDir, file.path)
    await writeFile(dest, content, 'utf8')
    console.log(`[sync-wiki] Written: wiki/${file.path}`)
  }

  console.log(`[sync-wiki] Done — ${mdFiles.length} file(s) updated.`)
}

run().catch((err) => {
  console.error('[sync-wiki] Fatal error:', err.message)
  process.exit(1)
})
