import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config/env', () => ({ isLocalMode: () => false }))

import { ensureVercelRedeploy, vercelProjectHasGitLink } from './deploy'

// A Vercel project deployed by `vercel deploy --prod` uploads has `link: null`.
// Redeploying its latest deployment replays the previous upload's files, so a
// commit Cactus pushed can never ship that way - and must never be reported as if
// it had. Seen on a Hobby site: v0.5.1894 -> v0.5.1895 "succeeded", ran 1894.

type Project = { link: unknown; accountId?: string } | 'fail'

function stubVercel(project: Project) {
  const calls: { url: string; method: string }[] = []
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method })
    if (url.includes('/v9/projects/')) {
      if (project === 'fail') return new Response('nope', { status: 500 })
      return Response.json({ accountId: project.accountId ?? 'user_1', link: project.link })
    }
    if (url.includes('/v6/deployments')) {
      return Response.json({ deployments: [{ uid: 'dpl_old', name: 'site', state: 'READY' }] })
    }
    if (url.includes('/v13/deployments') && method === 'POST') {
      return Response.json({ id: 'dpl_new' })
    }
    return new Response('unexpected', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { posts: () => calls.filter((c) => c.method === 'POST') }
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('vercelProjectHasGitLink', () => {
  it('is false for a CLI-uploaded project (link: null)', async () => {
    stubVercel({ link: null })
    expect(await vercelProjectHasGitLink('t', 'prj')).toBe(false)
  })

  it('is true for a Git-linked project', async () => {
    stubVercel({ link: { type: 'github', repo: 'site' } })
    expect(await vercelProjectHasGitLink('t', 'prj')).toBe(true)
  })

  it('fails open when the project API will not answer', async () => {
    stubVercel('fail')
    expect(await vercelProjectHasGitLink('t', 'prj')).toBe(true)
  })
})

describe('ensureVercelRedeploy with requireLatestCommit', () => {
  it('refuses without POSTing on a project with no Git link', async () => {
    const v = stubVercel({ link: null })
    const result = await ensureVercelRedeploy('t', 'prj', { requireLatestCommit: true })
    expect(result).toEqual({ triggered: false, error: 'no-git-link' })
    expect(v.posts()).toHaveLength(0)
  })

  it('POSTs as before on a Git-linked project', async () => {
    const v = stubVercel({ link: { type: 'github' } })
    const result = await ensureVercelRedeploy('t', 'prj', { requireLatestCommit: true })
    expect(result).toEqual({ triggered: true, deploymentId: 'dpl_new' })
    expect(v.posts()).toHaveLength(1)
  })

  it('POSTs as before when the project fetch fails (fail open)', async () => {
    const v = stubVercel('fail')
    const result = await ensureVercelRedeploy('t', 'prj', { requireLatestCommit: true })
    expect(result.triggered).toBe(true)
    expect(v.posts()).toHaveLength(1)
  })

  it('still replays on a no-link project when no commit needs shipping (env-var redeploy)', async () => {
    const v = stubVercel({ link: null })
    const result = await ensureVercelRedeploy('t', 'prj')
    expect(result.triggered).toBe(true)
    expect(v.posts()).toHaveLength(1)
  })
})
