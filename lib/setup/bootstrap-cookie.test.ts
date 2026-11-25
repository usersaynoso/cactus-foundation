import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { value: store.get(name) } : undefined),
    set: (name: string, value: string) => { store.set(name, value) },
  }),
}))
vi.mock('@/lib/config/env', () => ({ getSessionSecret: () => 'a'.repeat(48) }))
const { getSessionFromCookie } = vi.hoisted(() => ({ getSessionFromCookie: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie }))

import {
  SETUP_BOOTSTRAP_COOKIE,
  bootstrapCookieMatches,
  mayActOnSetupUser,
  parseBootstrapValue,
  setBootstrapCookie,
} from './bootstrap-cookie'

beforeEach(() => {
  store.clear()
  getSessionFromCookie.mockReset()
  getSessionFromCookie.mockResolvedValue(null)
})

describe('setup-bootstrap cookie', () => {
  it('vouches for the user it was minted for, and nobody else', async () => {
    await setBootstrapCookie('user-1')
    expect(await bootstrapCookieMatches('user-1')).toBe(true)
    expect(await bootstrapCookieMatches('user-2')).toBe(false)
  })

  it('rejects a tampered userId, signature or expiry', async () => {
    await setBootstrapCookie('user-1')
    const value = store.get(SETUP_BOOTSTRAP_COOKIE) as string
    expect(parseBootstrapValue(value.replace('user-1', 'user-2'))).toBeNull()
    expect(parseBootstrapValue(value.slice(0, -1) + (value.endsWith('0') ? '1' : '0'))).toBeNull()
    expect(parseBootstrapValue('user-1.99999999999999.deadbeef')).toBeNull()
    expect(parseBootstrapValue(undefined)).toBeNull()
    expect(parseBootstrapValue('garbage')).toBeNull()
  })

  it('is still good after a day, and gone after a week', async () => {
    await setBootstrapCookie('user-1')
    const value = store.get(SETUP_BOOTSTRAP_COOKIE) as string
    expect(parseBootstrapValue(value, Date.now() + 24 * 60 * 60 * 1000)).toBe('user-1')
  })

  it('rejects an expired cookie', async () => {
    await setBootstrapCookie('user-1')
    const value = store.get(SETUP_BOOTSTRAP_COOKIE) as string
    expect(parseBootstrapValue(value, Date.now() + 8 * 24 * 60 * 60 * 1000)).toBeNull()
  })

  it('lets a signed-in session act on its own account without the cookie', async () => {
    expect(await mayActOnSetupUser('user-1')).toBe(false)
    getSessionFromCookie.mockResolvedValue({ id: 'user-1' })
    expect(await mayActOnSetupUser('user-1')).toBe(true)
    expect(await mayActOnSetupUser('user-2')).toBe(false)
  })
})
