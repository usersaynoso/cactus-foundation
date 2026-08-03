import { beforeEach, describe, expect, it, vi } from 'vitest'

const { member } = vi.hoisted(() => ({
  member: { findUnique: vi.fn() },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: { member } }))

import { generateUsernameFromEmail, isUsernameFormatValid, loginRejectionForStatus } from './registration'

// Nobody is taken unless a test says so.
function taken(...usernames: string[]) {
  const set = new Set(usernames)
  member.findUnique.mockImplementation(async ({ where }: { where: { username: string } }) =>
    set.has(where.username) ? { id: 'existing' } : null
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  taken()
})

describe('generateUsernameFromEmail', () => {
  it('keeps the local part and appends digits', async () => {
    const username = await generateUsernameFromEmail('chris@taylor-guest.co.uk')
    expect(username).toMatch(/^chris\d{4}$/)
  })

  it('always produces a username the registration rules accept', async () => {
    const emails = [
      'chris@example.com',
      'Chris.Taylor-Guest@example.com',
      'a.b@example.com',
      "o'brien+tag@example.com",
      'jean.rené@example.com',
      '_leading_@example.com',
      'trailing-@example.com',
      'a-very-long-local-part-that-runs-well-past-the-limit@example.com',
    ]
    for (const email of emails) {
      const username = await generateUsernameFromEmail(email)
      expect(isUsernameFormatValid(username), `${email} -> ${username}`).toBe(true)
    }
  })

  it('strips the characters a username may not contain', async () => {
    expect(await generateUsernameFromEmail('Chris.Taylor+shop@example.com')).toMatch(/^christaylorshop\d{4}$/)
  })

  // A local part that is entirely punctuation leaves nothing to build on, and
  // a one-character handle is below the 2-character minimum.
  it('falls back to "member" when the address leaves nothing usable', async () => {
    expect(await generateUsernameFromEmail('+++@example.com')).toMatch(/^member\d{4}$/)
    expect(await generateUsernameFromEmail('c@example.com')).toMatch(/^member\d{4}$/)
  })

  it('never returns a username that is already taken', async () => {
    let call = 0
    member.findUnique.mockImplementation(async () => (++call === 1 ? { id: 'existing' } : null))
    const username = await generateUsernameFromEmail('chris@example.com')
    expect(username).toMatch(/^chris\d{4}$/)
    expect(call).toBe(2)
  })

  // Reserved words are refused by isUsernameAvailable, so a matching local
  // part must not be handed out just because the suffix makes it unique.
  it('respects the reserved-name blocklist', async () => {
    const username = await generateUsernameFromEmail('admin@example.com')
    expect(username).toMatch(/^admin\d{4}$/)
    expect(username).not.toBe('admin')
  })

  it('widens the suffix once a base has collided repeatedly', async () => {
    let call = 0
    member.findUnique.mockImplementation(async () => (++call <= 15 ? { id: 'existing' } : null))
    expect(await generateUsernameFromEmail('chris@example.com')).toMatch(/^chris\d{8}$/)
  })

  it('gives up rather than looping forever', async () => {
    member.findUnique.mockResolvedValue({ id: 'existing' })
    await expect(generateUsernameFromEmail('chris@example.com')).rejects.toThrow(/available username/)
  })
})

// Every route that issues a member session asks this first, including the
// verify-email route, which signs a member in the moment they click the link
// out of their inbox. A status that quietly returns null here would be handed
// a session by all of them at once, so the whole enum is pinned down.
describe('loginRejectionForStatus', () => {
  it('lets only ACTIVE members through', () => {
    expect(loginRejectionForStatus('ACTIVE')).toBeNull()
  })

  it('turns every other status away', () => {
    for (const status of ['PENDING_VERIFICATION', 'PENDING_APPROVAL', 'SUSPENDED', 'DELETED'] as const) {
      expect(loginRejectionForStatus(status)?.error, status).toBeTruthy()
    }
  })

  // The login form reads this flag to send an unverified member to the holding
  // page rather than showing them an error they can do nothing about.
  it('flags only the unverified case for the verify page', () => {
    expect(loginRejectionForStatus('PENDING_VERIFICATION')?.redirectToVerify).toBe(true)
    expect(loginRejectionForStatus('PENDING_APPROVAL')?.redirectToVerify).toBeUndefined()
  })
})
