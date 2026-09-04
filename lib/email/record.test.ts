import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Which sends are offered to a recorder, and which are not.
//
// The rule worth pinning down is the narrow one: a module's automatic mail is
// offered, core's own is not, and a send that failed is not offered at all. A
// password reset filed as a conversation in somebody's inbox would be a privacy
// leak wearing the clothes of a feature.

const log = vi.hoisted(() => ({ recordEmailSend: vi.fn() }))
vi.mock('@/lib/email/log', () => log)

const recorder = vi.hoisted(() => ({ recordOutboundModuleEmail: vi.fn() }))
vi.mock('@/lib/email/record', () => recorder)
// A module sender is lib/email/identity.ts's own subject. Stubbed here so these
// tests do not drag the whole generated extension-point graph in behind them -
// null is what a site with no such module installed answers anyway.
vi.mock('@/lib/email/identity', () => ({ resolveOutboundEmailIdentity: vi.fn().mockResolvedValue(null) }))

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

import { sendEmail } from './index'

const BASE = { to: 'sales@supplier.com', subject: 'Order PO-1042', html: '<p>Hi</p>', text: 'Hi' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('BREVO_API_KEY', 'site-key')
  vi.stubEnv('SMTP_HOST', '')
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

describe('keeping a copy of a module email', () => {
  it('offers a module send, with who it went to and what carried it', async () => {
    await sendEmail({
      ...BASE,
      cc: ['buying@supplier.com'],
      moduleName: 'purchase-orders',
      templateKey: 'purchase-orders.sent',
      from: { name: 'Deskwell Purchasing', address: 'purchasing@deskwell.co.uk' },
    })

    expect(recorder.recordOutboundModuleEmail).toHaveBeenCalledTimes(1)
    const offered = recorder.recordOutboundModuleEmail.mock.calls[0]![0]
    expect(offered).toMatchObject({
      moduleName: 'purchase-orders',
      templateKey: 'purchase-orders.sent',
      from: { name: 'Deskwell Purchasing', address: 'purchasing@deskwell.co.uk' },
      to: ['sales@supplier.com'],
      cc: ['buying@supplier.com'],
      subject: 'Order PO-1042',
      providerMessageId: '<brevo-1@brevo>',
    })
  })

  it('offers the site\'s own address when the module has not been given one', async () => {
    await sendEmail({ ...BASE, moduleName: 'purchase-orders' })
    expect(recorder.recordOutboundModuleEmail.mock.calls[0]![0].from).toEqual({
      name: 'Deskwell',
      address: 'noreply@deskwell.co.uk',
    })
  })

  it('says nothing about core\'s own mail', async () => {
    await sendEmail(BASE)
    expect(recorder.recordOutboundModuleEmail).not.toHaveBeenCalled()
  })

  it('says nothing when the send failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'nope' }),
    )
    await expect(sendEmail({ ...BASE, moduleName: 'purchase-orders' })).rejects.toThrow()
    expect(recorder.recordOutboundModuleEmail).not.toHaveBeenCalled()
  })

  it('carries only the attachments that actually travelled', async () => {
    await sendEmail({
      ...BASE,
      moduleName: 'purchase-orders',
      attachments: [
        { filename: 'PO-1042.pdf', content: Buffer.from('a small order'), contentType: 'application/pdf' },
        { filename: 'huge.pdf', content: Buffer.alloc(9 * 1024 * 1024), contentType: 'application/pdf' },
      ],
    })
    const offered = recorder.recordOutboundModuleEmail.mock.calls[0]![0]
    expect(offered.attachments.map((f: { filename: string }) => f.filename)).toEqual(['PO-1042.pdf'])
  })

  it('never lets a recorder take a sent email down with it', async () => {
    recorder.recordOutboundModuleEmail.mockRejectedValueOnce(new Error('filing cabinet on fire'))
    await expect(sendEmail({ ...BASE, moduleName: 'purchase-orders' })).resolves.toBeUndefined()
    expect(log.recordEmailSend).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
  })
})
