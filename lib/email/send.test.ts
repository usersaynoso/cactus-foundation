import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// What a message goes out AS, and what carries it.
//
// Both are optional additions to the payload, so the thing worth proving is
// mostly that nothing changed for the callers that do not use them: a site with
// one sending address and one account behaves exactly as it did, and the new
// fields only take effect when somebody sets them.

const log = vi.hoisted(() => ({ recordEmailSend: vi.fn() }))
vi.mock('@/lib/email/log', () => log)
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: {
      findUnique: vi.fn().mockResolvedValue({
        emailFromName: 'Deskwell',
        emailFromAddress: 'noreply@deskwell.co.uk',
        siteName: 'Deskwell',
      }),
    },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}))

// The test-email path renders a template first; what it renders is not what
// these tests are about.
vi.mock('@/lib/email/render', () => ({
  renderEmailTemplate: vi.fn().mockResolvedValue({
    subject: 'Test email',
    html: '<p>It works.</p>',
    text: 'It works.',
  }),
}))

const sendMail = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail })),
}))

import { sendEmail, sendTestEmailWithCredentials } from './index'

const BASE = { to: 'jane@customer.com', subject: 'Chairs', html: '<p>Hi</p>', text: 'Hi' }

function brevoBody(call: number = 0): Record<string, unknown> {
  const [, init] = vi.mocked(global.fetch).mock.calls[call]!
  return JSON.parse(String((init as RequestInit).body))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('BREVO_API_KEY', 'site-key')
  vi.stubEnv('SMTP_HOST', '')
  sendMail.mockResolvedValue({ messageId: '<smtp-1@localhost>' })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: '<brevo-1@brevo>' }),
      text: async () => '',
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the sender', () => {
  it('is the site\'s when the payload does not say otherwise', async () => {
    await sendEmail(BASE)
    expect(brevoBody().sender).toEqual({ name: 'Deskwell', email: 'noreply@deskwell.co.uk' })
  })

  it('is the payload\'s when it does', async () => {
    await sendEmail({ ...BASE, from: { name: 'Marcus at Deskwell', address: 'marcus@deskwell.co.uk' } })
    expect(brevoBody().sender).toEqual({
      name: 'Marcus at Deskwell',
      email: 'marcus@deskwell.co.uk',
    })
  })

  it('keeps the site\'s display name when only an address is given', async () => {
    // A bare address in the From line reads as spam to a person and to a filter.
    await sendEmail({ ...BASE, from: { address: 'marcus@deskwell.co.uk' } })
    expect(brevoBody().sender).toEqual({ name: 'Deskwell', email: 'marcus@deskwell.co.uk' })
  })

  it('reaches the SMTP transport too, not only Brevo', async () => {
    vi.stubEnv('BREVO_API_KEY', '')
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')

    await sendEmail({ ...BASE, from: { name: 'Marcus', address: 'marcus@deskwell.co.uk' } })

    expect(sendMail.mock.calls[0]![0].from).toBe('"Marcus" <marcus@deskwell.co.uk>')
  })
})

describe('the transport', () => {
  it('is the environment\'s when the payload does not say otherwise', async () => {
    await sendEmail(BASE)
    const [, init] = vi.mocked(global.fetch).mock.calls[0]!
    expect((init as RequestInit).headers).toMatchObject({ 'api-key': 'site-key' })
  })

  it('is the payload\'s account when one is given', async () => {
    await sendEmail({ ...BASE, transport: { provider: 'brevo', apiKey: 'inbox-key' } })
    const [, init] = vi.mocked(global.fetch).mock.calls[0]!
    expect((init as RequestInit).headers).toMatchObject({ 'api-key': 'inbox-key' })
  })

  it('sends over SMTP when asked to, even on a site set up for Brevo', async () => {
    await sendEmail({
      ...BASE,
      transport: { provider: 'smtp', host: 'mail.example.com', user: 'u', pass: 'p' },
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalledOnce()
  })

  it('a payload that brings its own account counts as configured', async () => {
    // Nothing in the environment at all - which is a site being set up, typing
    // credentials in to test them before saving.
    vi.stubEnv('BREVO_API_KEY', '')
    vi.stubEnv('SMTP_HOST', '')

    await expect(
      sendEmail({ ...BASE, transport: { provider: 'brevo', apiKey: 'typed-in-key' } }),
    ).resolves.toBeUndefined()
  })

  it('still refuses when there is neither an account nor an environment', async () => {
    vi.stubEnv('BREVO_API_KEY', '')
    vi.stubEnv('SMTP_HOST', '')
    await expect(sendEmail(BASE)).rejects.toThrow(/not configured/i)
  })
})

describe('the log', () => {
  it('records a send that used the payload\'s own account', async () => {
    await sendEmail({
      ...BASE,
      transport: { provider: 'brevo', apiKey: 'inbox-key' },
      headers: { 'Message-ID': '<uin.abc@deskwell.co.uk>' },
      moduleName: 'example-module',
    })

    expect(log.recordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        moduleName: 'example-module',
        messageId: '<uin.abc@deskwell.co.uk>',
      }),
    )
  })

  it('records a failure through an overridden account as well', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorised',
    } as unknown as Response)

    await expect(
      sendEmail({ ...BASE, transport: { provider: 'brevo', apiKey: 'wrong-key' } }),
    ).rejects.toThrow()

    expect(log.recordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    )
  })

  it('the "send a test" button now leaves a trace, which it never used to', async () => {
    // This is the send somebody makes when something is already wrong, so it is
    // the one they are most likely to go looking for afterwards. It used to
    // call the transport directly and write nothing.
    await sendTestEmailWithCredentials('owner@deskwell.co.uk', 'Deskwell', {
      provider: 'brevo',
      brevoApiKey: 'typed-in-key',
    })

    const [, init] = vi.mocked(global.fetch).mock.calls[0]!
    expect((init as RequestInit).headers).toMatchObject({ 'api-key': 'typed-in-key' })
    expect(log.recordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent', templateKey: 'system.test-email' }),
    )
  })

  it('tests SMTP credentials that are not in the environment yet', async () => {
    vi.stubEnv('BREVO_API_KEY', '')
    vi.stubEnv('SMTP_HOST', '')

    await sendTestEmailWithCredentials('owner@deskwell.co.uk', 'Deskwell', {
      provider: 'smtp',
      smtpHost: 'mail.example.com',
      smtpUser: 'u',
      smtpPass: 'p',
    })

    expect(sendMail).toHaveBeenCalledOnce()
    expect(log.recordEmailSend).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
  })
})
