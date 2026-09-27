import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The two public addresses. The rules that matter: never an error, never a
// redirect anywhere unsigned, and never a count for the site's own staff.

const events = vi.hoisted(() => ({ recordObservedEvent: vi.fn().mockResolvedValue(true) }))
vi.mock('./events', () => events)
vi.mock('@/lib/config/site', () => ({ isBehindCloudflare: vi.fn().mockResolvedValue(false) }))
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { handleClick, handleOpen } from './handlers'
import { signTrackingToken } from './token'

const SECRET = 'k'.repeat(48)
const SITE = 'https://deskwell.co.uk'

function facts(headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { header: (name: string) => lower[name.toLowerCase()] ?? null }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SESSION_SECRET', SECRET)
  vi.stubEnv('SITE_URL', SITE)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('a followed link', () => {
  it('goes where it was signed to go, and records the click after', async () => {
    const token = signTrackingToken({ k: 'c', e: 'log1', u: 'https://deskwell.co.uk/quote/7' }, SECRET)
    const out = handleClick(token, facts({ 'user-agent': 'Mozilla/5.0 (Macintosh) Safari', 'x-forwarded-for': '81.2.69.160' }))
    expect(out.location).toBe('https://deskwell.co.uk/quote/7')
    expect(events.recordObservedEvent).not.toHaveBeenCalled()
    await out.record!()
    expect(events.recordObservedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ e: 'log1', u: 'https://deskwell.co.uk/quote/7' }),
      expect.objectContaining({ kind: 'clicked', ip: '81.2.69.160', userAgent: 'Mozilla/5.0 (Macintosh) Safari' }),
    )
  })

  it('sends a forged or broken token home, never where it asked', () => {
    const real = signTrackingToken({ k: 'c', e: 'log1', u: 'https://deskwell.co.uk/' }, SECRET)
    const [v, , sig] = real.split('.')
    const body = Buffer.from(JSON.stringify({ k: 'c', e: 'log1', u: 'https://evil.example/' })).toString('base64url')
    for (const token of [`${v}.${body}.${sig}`, 'nonsense', '', '%E0%A4%A']) {
      const out = handleClick(token, facts())
      expect(out.location).toBe(`${SITE}/`)
      expect(out.record).toBeNull()
    }
  })

  it('will not redirect on an open token', () => {
    const open = signTrackingToken({ k: 'o', e: 'log1' }, SECRET)
    expect(handleClick(open, facts()).location).toBe(`${SITE}/`)
  })

  it('does not count somebody signed in to the admin', () => {
    const token = signTrackingToken({ k: 'c', e: 'log1', u: 'https://deskwell.co.uk/q' }, SECRET)
    const out = handleClick(token, facts({ cookie: 'theme=dark; cactus_session=abc' }))
    expect(out.location).toBe('https://deskwell.co.uk/q')
    expect(out.record).toBeNull()
  })
})

describe('the open picture', () => {
  it('records an open, classed by who fetched it', async () => {
    const token = signTrackingToken({ k: 'o', e: 'log1', m: 'unified-inbox', x: 'm1' }, SECRET)
    const out = handleOpen(`${token}.gif`, facts({ 'user-agent': 'Mozilla/5.0' }))
    await out.record!()
    expect(events.recordObservedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ e: 'log1', x: 'm1' }),
      expect.objectContaining({ kind: 'proxy_open' }),
    )
  })

  it('files an open seconds after sending as the mail system fetching it on arrival', async () => {
    const now = new Date('2026-09-27T12:25:24Z')
    const sentAt = Math.floor(now.getTime() / 1000) - 5
    const token = signTrackingToken({ k: 'o', e: 'log1', t: sentAt }, SECRET)
    const gmail = 'Mozilla/5.0 (Windows NT 10.0) Chrome/42.0 (via ggpht.com GoogleImageProxy)'
    await handleOpen(token, facts({ 'user-agent': gmail }), now).record!()
    expect(events.recordObservedEvent).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: 'proxy_open' }))

    await handleOpen(token, facts({ 'user-agent': gmail }), new Date(now.getTime() + 10 * 60_000)).record!()
    expect(events.recordObservedEvent).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ kind: 'opened' }))
  })

  it('records nothing for a bad token, a click token, or staff', () => {
    const click = signTrackingToken({ k: 'c', e: 'log1', u: 'https://a.example/' }, SECRET)
    const open = signTrackingToken({ k: 'o', e: 'log1' }, SECRET)
    expect(handleOpen('rubbish', facts()).record).toBeNull()
    expect(handleOpen(click, facts()).record).toBeNull()
    expect(handleOpen(open, facts({ cookie: 'cactus_session=x' })).record).toBeNull()
  })

  it('records nothing when the site has no key to check with', () => {
    vi.stubEnv('SESSION_SECRET', '')
    const open = signTrackingToken({ k: 'o', e: 'log1' }, SECRET)
    expect(handleOpen(open, facts()).record).toBeNull()
  })

  it('never lets a failed write escape', async () => {
    events.recordObservedEvent.mockRejectedValueOnce(new Error('database gone'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const open = signTrackingToken({ k: 'o', e: 'log1' }, SECRET)
    await expect(handleOpen(open, facts({ 'user-agent': 'Outlook' })).record!()).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
