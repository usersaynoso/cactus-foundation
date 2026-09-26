import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// sendEmail with the site's own tracking: which sends get it, what the log row
// says, and that nothing about tracking can stop an email going.

const log = vi.hoisted(() => ({ recordEmailSend: vi.fn() }))
vi.mock('@/lib/email/log', () => log)
const record = vi.hoisted(() => ({ recordOutboundModuleEmail: vi.fn() }))
vi.mock('@/lib/email/record', () => record)
vi.mock('@/lib/email/identity', () => ({ resolveOutboundEmailIdentity: vi.fn().mockResolvedValue(null) }))
const siteConfig = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { siteConfig, user: { findFirst: vi.fn().mockResolvedValue(null) } },
}))

const sendMail = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }))

import { sendEmail } from '../index'
import { verifyTrackingToken } from './token'

const SECRET = 'q'.repeat(48)
const HTML = '<html><body><p>Your quote: <a href="https://deskwell.co.uk/quote/7">view it</a></p></body></html>'
const BASE = { to: 'jane@customer.com', subject: 'Your quote', html: HTML, text: 'Your quote' }

function sentHtml(): string {
  return String(sendMail.mock.calls[0]![0].html)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('BREVO_API_KEY', '')
  vi.stubEnv('SMTP_HOST', 'smtp.mail.me.com')
  vi.stubEnv('SESSION_SECRET', SECRET)
  vi.stubEnv('SITE_URL', 'https://deskwell.co.uk')
  siteConfig.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    select.emailTracking
      ? { emailTracking: true }
      : { emailFromName: 'Deskwell', emailFromAddress: 'sales@deskwell.co.uk', siteName: 'Deskwell' })
  sendMail.mockResolvedValue({ messageId: '<abc@deskwell.co.uk>' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('an SMTP send', () => {
  it('goes out tracked, and the log row and the answer both say so', async () => {
    const sent = await sendEmail({ ...BASE, moduleName: 'quote-for-shop' })
    expect(sent.tracked).toBe(true)
    expect(sent.transport).toBe('smtp')
    expect(sent.providerId).toBe('<abc@deskwell.co.uk>')

    const html = sentHtml()
    const click = /\/api\/email\/c\/([^"]+)"/.exec(html)![1]!
    expect(verifyTrackingToken(click, SECRET)).toEqual({
      k: 'c', e: sent.emailLogId, m: 'quote-for-shop', u: 'https://deskwell.co.uk/quote/7',
    })
    expect(html).toContain('/api/email/o/')

    expect(log.recordEmailSend).toHaveBeenCalledWith(expect.objectContaining({
      id: sent.emailLogId, status: 'sent', transport: 'smtp', tracked: true,
    }))
  })

  it('hands the ref back inside the token', async () => {
    const sent = await sendEmail({ ...BASE, moduleName: 'unified-inbox', tracking: { ref: 'row-1' } })
    const open = /\/api\/email\/o\/([^"]+)"/.exec(sentHtml())![1]!
    expect(verifyTrackingToken(open, SECRET)).toEqual({ k: 'o', e: sent.emailLogId, m: 'unified-inbox', x: 'row-1' })
  })

  it('keeps an untracked copy for a module that files one', async () => {
    const sent = await sendEmail({ ...BASE, moduleName: 'purchase-orders' })
    expect(record.recordOutboundModuleEmail).toHaveBeenCalledWith(expect.objectContaining({
      html: HTML, emailLogId: sent.emailLogId, transport: 'smtp', tracked: true,
    }))
  })

  it('stays untracked when told, when the site says no, and for sign-in mail', async () => {
    await sendEmail({ ...BASE, tracking: false })
    expect(sentHtml()).toBe(HTML)

    sendMail.mockClear()
    await sendEmail({ ...BASE, templateKey: 'auth.login-code', headers: { 'X-Cactus-Template': 'auth.login-code' } })
    expect(sentHtml()).toBe(HTML)

    sendMail.mockClear()
    siteConfig.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.emailTracking ? { emailTracking: false } : { emailFromName: 'Deskwell', emailFromAddress: 'sales@deskwell.co.uk', siteName: 'Deskwell' })
    const sent = await sendEmail(BASE)
    expect(sent.tracked).toBe(false)
    expect(sentHtml()).toBe(HTML)
  })

  it('still sends when the tracking setting cannot be read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    siteConfig.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => {
      if (select.emailTracking) throw new Error('column "emailTracking" does not exist')
      return { emailFromName: 'Deskwell', emailFromAddress: 'sales@deskwell.co.uk', siteName: 'Deskwell' }
    })
    const sent = await sendEmail(BASE)
    expect(sent.tracked).toBe(false)
    expect(sentHtml()).toBe(HTML)
    spy.mockRestore()
  })

  it('takes an old open picture out of a quoted message even when not tracking', async () => {
    const quoted = `${HTML}<blockquote><img src="https://deskwell.co.uk/api/email/o/v1.old.sig"></blockquote>`
    await sendEmail({ ...BASE, html: quoted, tracking: false })
    expect(sentHtml()).not.toContain('/api/email/o/')
  })
})

describe('the site\'s choice of service', () => {
  it('sends over SMTP, tracked, when SMTP is chosen even though Brevo is set up too', async () => {
    vi.stubEnv('BREVO_API_KEY', 'site-key')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    siteConfig.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
      select.emailTracking
        ? { emailTracking: true, emailProvider: 'smtp' }
        : { emailFromName: 'Deskwell', emailFromAddress: 'sales@deskwell.co.uk', siteName: 'Deskwell' })
    const sent = await sendEmail(BASE)
    expect(sent).toMatchObject({ transport: 'smtp', tracked: true })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('a Brevo send', () => {
  it('is never tracked by the site - Brevo counts its own', async () => {
    vi.stubEnv('BREVO_API_KEY', 'site-key')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '<b@brevo>' }), text: async () => '' })
    vi.stubGlobal('fetch', fetch)
    const sent = await sendEmail(BASE)
    expect(sent).toMatchObject({ transport: 'brevo', tracked: false, providerId: '<b@brevo>' })
    const body = JSON.parse(String((fetch.mock.calls[0]![1] as RequestInit).body))
    expect(body.htmlContent).toBe(HTML)
  })
})
