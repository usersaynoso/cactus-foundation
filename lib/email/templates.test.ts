import { describe, it, expect, vi, beforeEach } from 'vitest'

// A member email has to say which template it is, or the tracking rules cannot
// tell a sign-in link from a newsletter and the email log cannot say what went.

const sendEmail = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email/index', () => ({ sendEmail }))
vi.mock('@/lib/email/render', () => ({
  renderEmailTemplate: vi.fn().mockResolvedValue({ subject: 'Sign in', html: '<p>Hi</p>', text: 'Hi' }),
}))

import { sendMemberEmail } from './templates'
import { shouldTrackSend } from './tracking/plan'

beforeEach(() => {
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ emailLogId: 'x', transport: 'smtp', tracked: false })
})

describe('sendMemberEmail', () => {
  it('passes the template key on the payload and in the header', async () => {
    await sendMemberEmail({ email: 'jane@example.com' }, 'member.magic-link', { siteName: 'Acme', magicUrl: 'https://example.com/m/abc' })
    const payload = sendEmail.mock.calls[0]![0]
    expect(payload.templateKey).toBe('member.magic-link')
    expect(payload.headers).toEqual({ 'X-Cactus-Template': 'member.magic-link' })
  })

  it('leaves a magic link untracked on an SMTP site with tracking on', async () => {
    await sendMemberEmail({ email: 'jane@example.com' }, 'member.magic-link', { siteName: 'Acme', magicUrl: 'https://example.com/m/abc' })
    const payload = sendEmail.mock.calls[0]![0]
    expect(shouldTrackSend({
      tracking: undefined,
      transport: 'smtp',
      templateKey: payload.templateKey,
      headers: payload.headers,
      html: payload.html,
      siteEnabled: true,
      secret: 'x'.repeat(32),
      siteUrl: 'https://example.com',
    })).toBe(false)
  })
})
