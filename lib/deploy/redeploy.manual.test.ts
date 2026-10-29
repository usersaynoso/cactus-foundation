import { describe, it, expect, vi, beforeEach } from 'vitest'

// startDeferredRedeploy on a host that cannot build commits (Vercel, no Git link).
// Everything below it is mocked: what matters is what it arms, what it tells the
// caller, and which build path it takes.

const h = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  canBuild: true,
  committed: false,
  siteConfigUpdate: vi.fn(),
  siteConfigUpdateMany: vi.fn(),
  moduleUpdateMany: vi.fn(),
  markAwaitingManualDeploy: vi.fn(),
  deployMainByUpload: vi.fn(async () => ({ triggered: true, deploymentId: 'dpl_upload' }) as { triggered: boolean; deploymentId?: string; error?: string }),
  triggerRedeploy: vi.fn(async () => ({ triggered: true, deploymentId: 'dpl_env' })),
  ensureRedeploy: vi.fn(async () => ({ triggered: true, deploymentId: 'dpl_fallback' })),
  listDeployments: vi.fn(async () => [] as unknown[]),
  syncModulesJson: vi.fn(async () => ({ committed: h.committed })),
}))

vi.mock('next/server', () => ({ after: (cb: () => Promise<void>) => h.afterCallbacks.push(cb) }))
vi.mock('@/lib/config/env', () => ({ isLocalMode: () => false }))
vi.mock('@/lib/config/site', () => ({ invalidateSiteConfigCache: vi.fn() }))
vi.mock('@/lib/hosting/provider', () => ({
  getHostingCredentials: () => ({ provider: 'vercel', token: 't', siteId: 'prj' }),
}))
vi.mock('@/lib/hosting/deploy', () => ({
  canBuildCommits: async () => h.canBuild,
  triggerRedeploy: h.triggerRedeploy,
  ensureRedeploy: h.ensureRedeploy,
  listDeployments: h.listDeployments,
}))
vi.mock('@/lib/modules/github', () => ({ syncModulesJson: h.syncModulesJson }))
vi.mock('@/lib/deploy/manual', () => ({ markAwaitingManualDeploy: h.markAwaitingManualDeploy }))
vi.mock('@/lib/deploy/upload-from-repo', () => ({ deployMainByUpload: h.deployMainByUpload }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: { update: h.siteConfigUpdate, updateMany: h.siteConfigUpdateMany },
    module: { findMany: vi.fn(async () => []), updateMany: h.moduleUpdateMany },
  },
}))

import { startDeferredRedeploy } from './redeploy'

const armed = () =>
  h.siteConfigUpdate.mock.calls.some(([arg]) => arg?.data?.pendingRedeployId === 'pending')

async function runAfter() {
  for (const cb of h.afterCallbacks.splice(0)) await cb()
}

beforeEach(() => {
  vi.clearAllMocks()
  h.afterCallbacks.length = 0
  h.canBuild = true
  h.committed = false
})

describe('startDeferredRedeploy on a project with no Git link', () => {
  it('a pushed commit is built by uploading main, never by a replay', async () => {
    h.canBuild = false
    const result = await startDeferredRedeploy({ committedSince: 1234 })

    expect(result).toEqual({ triggered: true })
    expect(armed()).toBe(true)
    await runAfter()
    expect(h.deployMainByUpload).toHaveBeenCalledTimes(1)
    // The upload's id rides onto the site marker and the queued modules.
    expect(h.moduleUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deployId: 'dpl_upload' } })
    )
    expect(h.ensureRedeploy).not.toHaveBeenCalled()
    expect(h.triggerRedeploy).not.toHaveBeenCalled()
    expect(h.markAwaitingManualDeploy).not.toHaveBeenCalled()
  })

  it('a module registry commit does the same', async () => {
    h.canBuild = false
    h.committed = true
    const result = await startDeferredRedeploy()

    expect(result).toEqual({ triggered: true })
    await runAfter()
    expect(h.deployMainByUpload).toHaveBeenCalledTimes(1)
    expect(h.triggerRedeploy).not.toHaveBeenCalled()
  })

  it('an upload that cannot start clears the gate and asks for a manual deploy', async () => {
    h.canBuild = false
    h.deployMainByUpload.mockResolvedValueOnce({ triggered: false, error: 'nope' })
    await startDeferredRedeploy({ committedSince: 1234 })
    await runAfter()

    expect(h.siteConfigUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pendingRedeployId: null, pendingRedeployAt: null } })
    )
    expect(h.markAwaitingManualDeploy).toHaveBeenCalledWith(1234)
    expect(h.ensureRedeploy).not.toHaveBeenCalled()
  })

  it('nothing to commit still runs the env-var redeploy', async () => {
    h.canBuild = false
    const result = await startDeferredRedeploy()

    expect(result).toEqual({ triggered: true })
    expect(armed()).toBe(true)
    await runAfter()
    expect(h.triggerRedeploy).toHaveBeenCalledTimes(1)
    // Synced once up front; not again inside after().
    expect(h.syncModulesJson).toHaveBeenCalledTimes(1)
    expect(h.markAwaitingManualDeploy).not.toHaveBeenCalled()
    expect(h.deployMainByUpload).not.toHaveBeenCalled()
  })
})

describe('startDeferredRedeploy on a Git-linked project (unchanged)', () => {
  it('arms the gate and adopts the push build', async () => {
    h.listDeployments.mockResolvedValueOnce([{ id: 'dpl_push', createdAt: Date.now() + 1, state: 'BUILDING' }])
    const result = await startDeferredRedeploy({ committedSince: Date.now() })

    expect(result).toEqual({ triggered: true })
    expect(armed()).toBe(true)
    expect(h.markAwaitingManualDeploy).not.toHaveBeenCalled()
  })
})
