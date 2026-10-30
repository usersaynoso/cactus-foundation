import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { keyFingerprint, resetKeyringState } from './keyring'
import { rotationStatus, type RotationRecord } from './rotation-status'

const OLD = 'a'.repeat(64)
const NEW = 'b'.repeat(64)
const saved = { key: process.env.ENCRYPTION_KEY, next: process.env.ENCRYPTION_KEY_NEXT }

function env(current: string | undefined, next?: string) {
  if (current === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = current
  if (next === undefined) delete process.env.ENCRYPTION_KEY_NEXT
  else process.env.ENCRYPTION_KEY_NEXT = next
}

const none: RotationRecord = { activeFingerprint: null, stagedFingerprint: null, swapRequestedAt: null }
const staged: RotationRecord = { ...none, stagedFingerprint: keyFingerprint(NEW) }

beforeEach(() => {
  resetKeyringState()
  env(OLD)
})
afterEach(() => env(saved.key, saved.next))

describe('rotationStatus', () => {
  it('walks S0 to S3', () => {
    expect(rotationStatus(none).phase).toBe('idle')
    // Written to the host, not yet deployed.
    expect(rotationStatus(staged).phase).toBe('staged')
    env(OLD, NEW)
    expect(rotationStatus(staged).phase).toBe('ready')
    const rotated = { ...staged, activeFingerprint: keyFingerprint(NEW) }
    expect(rotationStatus(rotated).phase).toBe('rotated')
    expect(rotationStatus({ ...rotated, swapRequestedAt: new Date() }).phase).toBe('swapping')
    env(NEW)
    expect(rotationStatus({ ...rotated, swapRequestedAt: new Date() })).toMatchObject({ phase: 'idle', settle: true })
  })

  it('treats a new host given the new key directly as finished', () => {
    env(NEW)
    expect(rotationStatus({ ...staged, activeFingerprint: keyFingerprint(NEW) })).toMatchObject({ phase: 'idle', settle: true })
  })

  it('a staged key that is not the one deployed stays staged', () => {
    env(OLD, 'c'.repeat(64))
    expect(rotationStatus(staged).phase).toBe('staged')
  })

  it('flags data under a key this deployment does not hold', () => {
    env(OLD)
    expect(rotationStatus({ ...none, activeFingerprint: keyFingerprint(NEW) }).phase).toBe('mismatch')
  })

  it('no key, nothing to do', () => {
    env(undefined)
    expect(rotationStatus(none).phase).toBe('no-key')
  })
})
