import { describe, it, expect } from 'vitest'
import { isDeployInFlight, type DeployStatus } from './deploy-status-client'

// The store is a module-level singleton driven by network polling, so the
// decision it feeds is tested as the pure function the hook wraps.
function status(over: Partial<DeployStatus> = {}): DeployStatus {
  return { active: false, failed: false, state: '', lines: [], ...over }
}

describe('isDeployInFlight', () => {
  it('is false when nothing is deploying', () => {
    expect(isDeployInFlight(status())).toBe(false)
  })

  it('is true while a build the site started is running', () => {
    expect(isDeployInFlight(status({ active: true, state: 'BUILDING' }))).toBe(true)
  })

  // The panel stays on screen after a failure (that is where Dismiss lives), so
  // `active` remains true. Treating that as an in-flight build greyed out every
  // install/update button for good, even though the server routes accept the
  // work - getDeployInFlight() answers null for an ERRORed deployment.
  it('is false once the build has failed, so the buttons come back', () => {
    expect(isDeployInFlight(status({ active: true, failed: true, state: 'ERROR' }))).toBe(false)
  })
})
