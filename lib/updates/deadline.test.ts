import { describe, it, expect } from 'vitest'
import {
  assertWithinDeadline,
  deadlineFromNow,
  isDeadlineError,
  msRemaining,
  ROUTE_WORK_BUDGET_MS,
  DeadlineExceededError,
} from './deadline'
import { looksLikeGitHubProblem } from './github-outage'

describe('update deadline', () => {
  it('leaves headroom under the 60s function ceiling', () => {
    expect(ROUTE_WORK_BUDGET_MS).toBeLessThan(60_000)
    expect(deadlineFromNow()).toBeLessThanOrEqual(Date.now() + ROUTE_WORK_BUDGET_MS)
  })

  it('treats an absent deadline as unlimited', () => {
    expect(msRemaining(undefined)).toBe(Number.POSITIVE_INFINITY)
    expect(() => assertWithinDeadline(undefined, 'doing a thing')).not.toThrow()
  })

  it('passes while there is budget left and throws once there is not', () => {
    expect(() => assertWithinDeadline(Date.now() + 5_000, 'doing a thing')).not.toThrow()
    expect(() => assertWithinDeadline(Date.now() - 1, 'doing a thing')).toThrow(DeadlineExceededError)
  })

  it('says nothing was changed, and reads as a GitHub problem to the UI', () => {
    let message = ''
    try {
      assertWithinDeadline(Date.now() - 1, 'downloading the updated files from GitHub')
    } catch (err) {
      expect(isDeadlineError(err)).toBe(true)
      message = (err as Error).message
    }
    expect(message).toContain('Nothing was changed')
    // The admin only shows the "check GitHub's status page" line for messages this
    // recognises, so a deadline abort has to match it.
    expect(looksLikeGitHubProblem(message)).toBe(true)
  })
})
