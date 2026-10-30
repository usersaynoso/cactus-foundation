import { envKeys, isEncryptionKeyUsable, keyFingerprint } from './keyring'

// Where a site is in a key rotation (the S0-S3 states in lib/crypto/rotation.ts),
// worked out from what the database recorded and what the RUNNING deployment's
// environment holds - never from the host's settings, which a redeploy has not
// necessarily delivered yet and which Vercel will not read back anyway.

export type RotationPhase =
  /** No usable key: nothing to rotate. */
  | 'no-key'
  /** S0. Nothing in progress. */
  | 'idle'
  /** A new key is written to the host as NEXT, but this deployment does not have it yet. */
  | 'staged'
  /** S1. This deployment holds NEXT and it is the staged key: the rotation may run. */
  | 'ready'
  /** S2. The data is under NEXT; the swap into ENCRYPTION_KEY is the step left. */
  | 'rotated'
  /** The swap is written to the host; waiting for the redeploy that carries it. */
  | 'swapping'
  /** The data is under a key this deployment does not hold at all. Needs a person. */
  | 'mismatch'

export type RotationRecord = {
  activeFingerprint: string | null
  stagedFingerprint: string | null
  swapRequestedAt: Date | null
}

export type RotationStatus = {
  phase: RotationPhase
  currentFingerprint: string | null
  nextFingerprint: string | null
  /** The record should be tidied (the rotation finished, or a stale stage). */
  settle: boolean
}

export function rotationStatus(record: RotationRecord): RotationStatus {
  const { current, next } = envKeys()
  const currentFingerprint = current ? keyFingerprint(current) : null
  const nextFingerprint = next ? keyFingerprint(next) : null
  const base = { currentFingerprint, nextFingerprint, settle: false }
  const { activeFingerprint, stagedFingerprint } = record

  if (!isEncryptionKeyUsable()) return { ...base, phase: 'no-key' }

  if (activeFingerprint && activeFingerprint !== currentFingerprint && activeFingerprint !== nextFingerprint) {
    return { ...base, phase: 'mismatch' }
  }

  if (!stagedFingerprint) {
    // A rotation committed with no staging record left - still the swap to do.
    if (nextFingerprint && activeFingerprint === nextFingerprint) return { ...base, phase: 'rotated' }
    return { ...base, phase: 'idle' }
  }

  // The swap has landed: the staged key IS ENCRYPTION_KEY. A NEXT left behind
  // equal to it (its removal failed) is harmless and changes nothing.
  if (currentFingerprint === stagedFingerprint && (!next || nextFingerprint === stagedFingerprint)) {
    return { ...base, phase: 'idle', settle: true }
  }
  if (record.swapRequestedAt) return { ...base, phase: 'swapping' }
  if (activeFingerprint === stagedFingerprint) return { ...base, phase: 'rotated' }
  if (nextFingerprint === stagedFingerprint) return { ...base, phase: 'ready' }
  return { ...base, phase: 'staged' }
}
