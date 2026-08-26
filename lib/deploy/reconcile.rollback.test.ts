import { describe, it, expect } from 'vitest'

// The rollback decision markModulesDeployFailed makes, isolated from Prisma.
// Mirrors the ternary in reconcile.ts; if that ternary changes, change this.
function rollbackFor(m: { pendingVersion: string | null; updateAvailable: string | null }) {
  return m.pendingVersion
    ? {
        status: 'update_available',
        updateAvailable: m.pendingVersion,
        pendingVersion: null,
        lastError: null,
      }
    : { status: 'failed', pendingVersion: null, lastError: 'Deployment failed' }
}

describe('markModulesDeployFailed rollback', () => {
  // The state a module is ACTUALLY in when a failed update reaches rollback:
  // every update route sets updateAvailable to null at the moment it queues the
  // module, so the old discriminator was always null and every failed update was
  // filed as a failed install. 'failed' is excluded from modules.json, so the
  // next build dropped the module off the site entirely.
  it('sends a failed update back to update_available, not failed', () => {
    const row = { pendingVersion: 'v0.1.169', updateAvailable: null }

    expect(rollbackFor(row).status).toBe('update_available')
    expect(rollbackFor(row).status).not.toBe('failed')
  })

  it('restores the version the Updates tab needs to offer', () => {
    const row = { pendingVersion: 'v0.1.169', updateAvailable: null }

    // Without this the card renders "Update to " with an empty version.
    expect(rollbackFor(row).updateAvailable).toBe('v0.1.169')
  })

  it('clears the in-flight target so the confirmed version stands', () => {
    const row = { pendingVersion: 'v0.1.169', updateAvailable: null }

    expect(rollbackFor(row).pendingVersion).toBeNull()
    expect(rollbackFor(row).lastError).toBeNull()
  })

  // An install has no prior version to fall back to, so 'failed' is right there -
  // and installs never set pendingVersion, which is what makes it the correct
  // discriminator.
  it('still files a failed install as failed', () => {
    const row = { pendingVersion: null, updateAvailable: null }

    expect(rollbackFor(row).status).toBe('failed')
    expect(rollbackFor(row).lastError).toBe('Deployment failed')
  })
})

// The guard the Vercel webhook applies before reconciling anything.
function isTracked(tracked: string | null, deploymentId: string | undefined) {
  return tracked === 'pending' || (!!deploymentId && deploymentId === tracked)
}

describe('vercel webhook deployment tracking', () => {
  it('reconciles the deployment it is waiting on', () => {
    expect(isTracked('dpl_ours', 'dpl_ours')).toBe(true)
  })

  it('reconciles while the real id is still unresolved', () => {
    expect(isTracked('pending', 'dpl_whatever')).toBe(true)
  })

  // The one that mattered: a cancelled or failed deployment belonging to someone
  // else used to mark every module mid-deploy as failed, and 'failed' means
  // "drop from the next build".
  it('ignores an unrelated deployment', () => {
    expect(isTracked('dpl_ours', 'dpl_someone_elses')).toBe(false)
  })

  it('ignores any deployment when nothing is being tracked', () => {
    expect(isTracked(null, 'dpl_someone_elses')).toBe(false)
  })
})

// The in-flight gate's decision, with the async boundary that matters. An
// `await` dropped in front of the "is a build running?" call makes the gate
// return a Promise - always truthy - which blocks every install and update on
// the site for ever, and typechecks perfectly happily.
async function running(value: boolean) {
  return value
}

describe('deploy in-flight gate', () => {
  it('does not gate when no build is running', async () => {
    const gated = (await running(false)) ? { deploymentId: 'latest' } : null
    expect(gated).toBeNull()
  })

  it('gates when a build is running', async () => {
    const gated = (await running(true)) ? { deploymentId: 'latest' } : null
    expect(gated).not.toBeNull()
  })

  it('a forgotten await would gate unconditionally', () => {
    // Documents the failure mode: both branches truthy, so the gate never opens.
    expect(Boolean(running(false))).toBe(true)
    expect(Boolean(running(true))).toBe(true)
  })
})

// Which modules a finished deployment is allowed to reconcile. Mirrors
// deployingModulesFor in reconcile.ts.
function eligible(
  deploying: Array<{ name: string; deployId: string | null }>,
  deploymentId?: string | null
) {
  if (!deploymentId) return deploying
  return deploying.filter((m) => !m.deployId || m.deployId === 'pending' || m.deployId === deploymentId)
}

describe('per-module deployment matching', () => {
  const rows = [
    { name: 'shop', deployId: 'dpl_ours' },
    { name: 'gazette', deployId: 'dpl_theirs' },
    { name: 'twilio', deployId: 'pending' },
    { name: 'legacy', deployId: null },
  ]

  it('reconciles only the modules riding the finished build', () => {
    expect(eligible(rows, 'dpl_ours').map((m) => m.name)).toEqual(['shop', 'twilio', 'legacy'])
  })

  // The residual this closes: an unrelated build could previously promote or roll
  // back every module in 'deploying', because the only tracker was a site-wide
  // marker that expires after four minutes.
  it('leaves a module riding a different build alone', () => {
    expect(eligible(rows, 'dpl_ours').map((m) => m.name)).not.toContain('gazette')
  })

  // Queued before the real id was known: the build is still ours.
  it('includes rows still on the pending sentinel', () => {
    expect(eligible(rows, 'dpl_ours').map((m) => m.name)).toContain('twilio')
  })

  // Rows written by a build that predates deployId must keep working.
  it('includes rows with no deployId at all', () => {
    expect(eligible(rows, 'dpl_ours').map((m) => m.name)).toContain('legacy')
  })

  it('falls back to the whole set when the caller has no id to offer', () => {
    expect(eligible(rows).map((m) => m.name)).toEqual(['shop', 'gazette', 'twilio', 'legacy'])
  })
})

// The status a reconcile is allowed to act on. Mirrors
// deploymentStatusForReconcile in lib/deploy/in-flight.ts.
function reconcileStatus(args: {
  trackedId?: string | null
  since?: number | null
  newest?: { created: number; readyState: string } | null
  byId?: 'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN'
}) {
  if (args.trackedId && args.trackedId !== 'pending') return args.byId ?? 'UNKNOWN'
  const n = args.newest
  if (!n) return 'UNKNOWN'
  if (args.since && n.created <= args.since) return 'UNKNOWN'
  if (['BUILDING', 'QUEUED', 'INITIALIZING'].includes(n.readyState)) return 'BUILDING'
  if (n.readyState === 'READY') return 'READY'
  if (n.readyState === 'ERROR' || n.readyState === 'CANCELED') return 'ERROR'
  return 'UNKNOWN'
}

describe('deploymentStatusForReconcile', () => {
  const pushedAt = 1_000_000

  // Observed live on 2026-08-26. The redeploy sentinel is written synchronously
  // and the real deployment id only arrives from a poll seconds later. A status
  // check landing in that gap saw the PREVIOUS build - green, and finished before
  // we pushed - and promoted reviews-for-shop to v0.1.12 while the build carrying
  // v0.1.12 still had 80 seconds to run.
  it('refuses to answer from a build that finished before we pushed', () => {
    expect(
      reconcileStatus({
        trackedId: 'pending',
        since: pushedAt,
        newest: { created: pushedAt - 5_000, readyState: 'READY' },
      })
    ).toBe('UNKNOWN')
  })

  it('accepts a build that started after we pushed', () => {
    expect(
      reconcileStatus({
        trackedId: 'pending',
        since: pushedAt,
        newest: { created: pushedAt + 3_000, readyState: 'READY' },
      })
    ).toBe('READY')
  })

  it('reports our own build as still running', () => {
    expect(
      reconcileStatus({
        trackedId: 'pending',
        since: pushedAt,
        newest: { created: pushedAt + 3_000, readyState: 'BUILDING' },
      })
    ).toBe('BUILDING')
  })

  // A resolved id is asked about directly - no guessing needed.
  it('asks about a specific deployment when it has one', () => {
    expect(reconcileStatus({ trackedId: 'dpl_ours', byId: 'ERROR' })).toBe('ERROR')
  })

  it('is UNKNOWN when there is no deployment to look at', () => {
    expect(reconcileStatus({ trackedId: null, since: pushedAt, newest: null })).toBe('UNKNOWN')
  })

  // A cancelled build is a failure, and must still roll modules back.
  it('treats a cancelled build as a failure', () => {
    expect(
      reconcileStatus({
        trackedId: 'pending',
        since: pushedAt,
        newest: { created: pushedAt + 3_000, readyState: 'CANCELED' },
      })
    ).toBe('ERROR')
  })
})
