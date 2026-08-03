import { describe, expect, it, vi } from 'vitest'

// The renderer reaches for the site record, the palette and the wrapper layout.
// None of that is what these tests are about, so the client is stubbed down to
// "a site called Acme Widgets, no logo, no wrapper, no admin override".
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: { findUnique: async () => ({ siteName: 'Acme Widgets', logoMediaId: null, designTokens: null }) },
    media: { findUnique: async () => null },
    layout: { findFirst: async () => null, findMany: async () => [] },
    emailTemplate: { findUnique: async () => null },
  },
}))

const { previewEmailTemplate } = await import('@/lib/email/render')

describe('previewEmailTemplate', () => {
  it('shows the real site name in the subject and the body', async () => {
    const rendered = await previewEmailTemplate('member.verify-email', {})

    expect(rendered.subject).toBe('Verify your Acme Widgets account')
    expect(rendered.html).toContain('<h3>Verify your Acme Widgets account</h3>')
    // The old behaviour stamped a stand-in over every declared tag, site name
    // included, which read as "this tag does not work" to anyone previewing
    // their own copy.
    expect(rendered.html).not.toContain('[siteName]')
    expect(rendered.subject).not.toContain('[siteName]')
  })

  it('still stands in for tags whose value only exists at send time', async () => {
    const rendered = await previewEmailTemplate('member.verify-email', {})
    expect(rendered.html).toContain('https://example.com/sample-link')
  })

  it('lets the caller override a site value anyway', async () => {
    const rendered = await previewEmailTemplate('member.verify-email', {}, { siteName: 'Beta Ltd' })
    expect(rendered.subject).toBe('Verify your Beta Ltd account')
  })
})
