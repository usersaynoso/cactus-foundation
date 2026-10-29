import { describe, it, expect, vi, beforeEach } from 'vitest'

// startDeferredRedeploy on a host that cannot build commits (Vercel, no Git link).
// Everything below it is mocked: what matters is what it arms, what it tells the
// caller, and which build path it takes.

const h = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => Promise<void>>,
  canBuild: true,
  committed: false,
  siteConfigUpdate: vi.fn(),
  markAwaitingManualDeploy: vi.fn(),
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
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: { update: h.siteConfigUpdate, updateMany: vi.fn() },
    module: { findMany: vi.fn(async () => []), updateMany: vi.fn() },
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
  it('a pushed commit arms nothing and asks for a manual deploy', async () => {
    h.canBuild = false
    const result = await startDeferredRedeploy({ committedSince: 1234 })

    expect(result).toEqual({ triggered: false, manualDeployRequired: true })
    expect(armed()).toBe(false)
    expect(h.afterCallbacks).toHaveLength(0)
    // Modules are re-tagged to wait for the owner's deploy, not promoted.
    expect(h.markAwaitingManualDeploy).toHaveBeenCalledWith(1234)
    expect(h.ensureRedeploy).not.toHaveBeenCalled()
  })

  it('a module registry commit does the same', async () => {
    h.canBuild = false
    h.committed = true
    const result = await startDeferredRedeploy()

    expect(result).toEqual({ triggered: false, manualDeployRequired: true })
    expect(armed()).toBe(false)
    expect(h.markAwaitingManualDeploy).toHaveBeenCalledTimes(1)
    expect(h.triggerRedeploy).not.toHaveBeenCalled()
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
