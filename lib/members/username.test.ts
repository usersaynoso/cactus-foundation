import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }))
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: queryRaw } }))

import {
  isCaseOnlyUsernameChange,
  isUsernameAvailable,
  isUsernameFormatValid,
  usernameCooldownEndsAt,
} from './username'

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
  queryRaw.mockResolvedValue([])
})

describe('isUsernameFormatValid', () => {
  it('accepts capitals alongside the existing characters', () => {
    for (const ok of ['ChrisTG', 'chris', 'Chris_TG-2', 'AB']) expect(isUsernameFormatValid(ok), ok).toBe(true)
  })

  it('still refuses everything else', () => {
    for (const bad of ['a', 'has space', 'dot.ted', 'émile', 'x'.repeat(33), '']) {
      expect(isUsernameFormatValid(bad), bad).toBe(false)
    }
  })
})

describe('isCaseOnlyUsernameChange', () => {
  it('is true only for the same name in different capitals', () => {
    expect(isCaseOnlyUsernameChange('chris', 'Chris')).toBe(true)
    expect(isCaseOnlyUsernameChange('ChrisTG', 'christg')).toBe(true)
    expect(isCaseOnlyUsernameChange('chris', 'chris')).toBe(false)
    expect(isCaseOnlyUsernameChange('chris', 'Chris2')).toBe(false)
  })
})

describe('usernameCooldownEndsAt', () => {
  const now = new Date('2026-11-24T12:00:00Z')

  it('0 days means no cooldown, even straight after a change', () => {
    expect(usernameCooldownEndsAt(now, { usernameChangeCooldownDays: 0 }, now)).toBeNull()
  })

  it('never changed means no cooldown', () => {
    expect(usernameCooldownEndsAt(null, { usernameChangeCooldownDays: 90 }, now)).toBeNull()
  })

  it('runs for the configured days from the last change', () => {
    const changed = new Date(now.getTime() - 10 * DAY)
    expect(usernameCooldownEndsAt(changed, { usernameChangeCooldownDays: 30 }, now)).toEqual(
      new Date(changed.getTime() + 30 * DAY)
    )
  })

  it('is over once the days have passed', () => {
    const changed = new Date(now.getTime() - 31 * DAY)
    expect(usernameCooldownEndsAt(changed, { usernameChangeCooldownDays: 30 }, now)).toBeNull()
  })
})

describe('isUsernameAvailable', () => {
  it('refuses reserved words in any capitals without asking the database', async () => {
    expect(await isUsernameAvailable('Admin')).toBe(false)
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it('compares in lowercase and checks held previous names', async () => {
    await isUsernameAvailable('ChrisTG', { exceptMemberId: 'm1' })
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    const sql = strings.join('?')
    expect(sql).toContain('lower("username") = lower(?)')
    expect(sql).toContain('lower("previousUsername") = lower(?)')
    expect(sql).toContain('"previousUsernameExpiresAt" > NOW()')
    expect(values).toEqual(['m1', 'ChrisTG', 'ChrisTG'])
  })

  it('answers from whether anyone matched', async () => {
    expect(await isUsernameAvailable('chris')).toBe(true)
    queryRaw.mockResolvedValueOnce([{ id: 'someone' }])
    expect(await isUsernameAvailable('chris')).toBe(false)
  })
})
