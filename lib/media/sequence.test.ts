import { describe, it, expect, beforeAll } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  signSequenceContext,
  verifySequenceContext,
  verifyCallbackSignature,
  buildDestPrefix,
  prefixFromManifestKey,
  posterKeyFromManifestKey,
} from './sequence'

// The token + signature helpers read their keys from the environment via lazy
// getters (getSessionSecret / getSequenceWorkerSecret), so setting these before
// the tests run - not at import time - is enough.
const WORKER_SECRET = 'test-worker-secret-value'
beforeAll(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters'
  process.env.SEQUENCE_WORKER_SECRET = WORKER_SECRET
})

describe('sequence context token (folder + name carried across the callback)', () => {
  it('round-trips a folder id and name', () => {
    const token = signSequenceContext({ folderId: 'fld_123', name: 'Height Adjustable' })
    expect(verifySequenceContext(token)).toEqual({ folderId: 'fld_123', name: 'Height Adjustable', machineId: null })
  })

  it('round-trips a null folder (library root)', () => {
    const token = signSequenceContext({ folderId: null, name: 'x' })
    expect(verifySequenceContext(token)).toEqual({ folderId: null, name: 'x', machineId: null })
  })

  it('round-trips a per-job machine id', () => {
    const token = signSequenceContext({ folderId: null, name: 'x', machineId: 'd896d92f759028' })
    expect(verifySequenceContext(token)).toEqual({ folderId: null, name: 'x', machineId: 'd896d92f759028' })
  })

  it('rejects a tampered payload', () => {
    const token = signSequenceContext({ folderId: null, name: 'x' })
    const sig = token.slice(token.indexOf('.') + 1)
    const forged = Buffer.from(JSON.stringify({ folderId: 'evil', name: 'x' }), 'utf-8').toString('base64url')
    expect(verifySequenceContext(`${forged}.${sig}`)).toBeNull()
  })

  it('rejects rubbish', () => {
    expect(verifySequenceContext('nope')).toBeNull()
    expect(verifySequenceContext('')).toBeNull()
  })
})

describe('worker callback signature', () => {
  it('accepts a body HMAC-signed with the shared worker secret', () => {
    const body = JSON.stringify({ jobId: 'j', status: 'done', manifestKey: 'media/x/manifest.json' })
    const sig = createHmac('sha256', WORKER_SECRET).update(body).digest('hex')
    expect(verifyCallbackSignature(body, sig)).toBe(true)
  })

  it('rejects a wrong or missing signature', () => {
    const body = '{"a":1}'
    expect(verifyCallbackSignature(body, 'deadbeef')).toBe(false)
    expect(verifyCallbackSignature(body, null)).toBe(false)
  })
})

describe('destPrefix + key helpers', () => {
  it('builds a clean, slugged, traversal-free destPrefix', () => {
    expect(buildDestPrefix('shop/Office Chairs', 'Height Adjustable!!')).toBe('shop/office-chairs/height-adjustable')
    // Path traversal segments collapse to nothing rather than escaping the tree.
    expect(buildDestPrefix('../../etc', 'x')).toBe('etc/x')
    expect(buildDestPrefix('', 'Just A Name')).toBe('just-a-name')
  })

  it('derives the folder prefix and poster key from a manifest key', () => {
    const key = 'media/shop/x/chiro/manifest.json'
    expect(prefixFromManifestKey(key)).toBe('media/shop/x/chiro/')
    expect(posterKeyFromManifestKey(key)).toBe('media/shop/x/chiro/poster.webp')
  })
})
