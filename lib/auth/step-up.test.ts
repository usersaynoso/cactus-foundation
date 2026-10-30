import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import type { SessionUser } from '@/lib/auth/session'

const fresh = vi.hoisted(() => ({ value: false, allowed: true }))

vi.mock('@/lib/auth/session', () => ({ isCurrentSessionFresh: async () => fresh.value }))
vi.mock('@/lib/auth/rate-limit', () => ({ checkAndRecord: async () => ({ allowed: fresh.allowed }) }))

import { confirmStepUp } from './step-up'

const hash = bcrypt.hashSync('correct horse', 4)

function user(passwordHash: string | null): SessionUser {
  return { id: 'u1', passwordHash } as unknown as SessionUser
}

beforeEach(() => {
  fresh.value = false
  fresh.allowed = true
})

describe('confirmStepUp', () => {
  it('passes the right password', async () => {
    expect(await confirmStepUp(user(hash), 'correct horse')).toEqual({ ok: true })
  })

  it('refuses a wrong or missing password', async () => {
    expect(await confirmStepUp(user(hash), 'battery staple')).toMatchObject({ ok: false, status: 401 })
    expect(await confirmStepUp(user(hash), '')).toMatchObject({ ok: false, status: 401 })
  })

  it('refuses once rate limited, even with the right password', async () => {
    fresh.allowed = false
    expect(await confirmStepUp(user(hash), 'correct horse')).toMatchObject({ ok: false, status: 429 })
  })

  it('a passkey-only account needs a fresh sign-in instead', async () => {
    expect(await confirmStepUp(user(null), 'anything')).toMatchObject({ ok: false, status: 401 })
    fresh.value = true
    expect(await confirmStepUp(user(null), undefined)).toEqual({ ok: true })
  })
})
