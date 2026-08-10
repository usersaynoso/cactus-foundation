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

describe('the plain-text alternative', () => {
  it('keeps the address an anchor pointed at', async () => {
    const rendered = await previewEmailTemplate(
      'member.verify-email',
      { bodyHtml: '<p>Hello.</p><p><a href="{{verifyUrl}}">Confirm your address</a></p>' },
      { verifyUrl: 'https://example.com/verify?token=abc' },
    )
    // The old renderer stripped tags off the TEMPLATE, so the href went with
    // the tag and the text part said "Confirm your address" and nothing else.
    expect(rendered.text).toContain('Confirm your address (https://example.com/verify?token=abc)')
  })

  it('does not say the address twice when the label already is one', async () => {
    const rendered = await previewEmailTemplate(
      'member.verify-email',
      { bodyHtml: '<p><a href="{{verifyUrl}}">{{verifyUrl}}</a></p>' },
      { verifyUrl: 'https://example.com/verify' },
    )
    expect(rendered.text).toBe('https://example.com/verify')
  })

  it('lands a merge value carrying a tag as text, not as markup', async () => {
    const rendered = await previewEmailTemplate(
      'member.verify-email',
      { bodyHtml: '<p>Reason: {{siteName}}</p>' },
      { siteName: '<b>bold</b> and <script>alert(1)</script>' },
    )
    expect(rendered.text).toContain('<b>bold</b> and <script>alert(1)</script>')
    // Which is to say it is TEXT: nothing in the text part is a tag the reader's
    // client could act on, because everything that was one has been stripped.
    expect(rendered.text).not.toContain('<p>')
  })

  it('reads back the entities the escaper put in', async () => {
    const rendered = await previewEmailTemplate(
      'member.verify-email',
      { bodyHtml: '<p>{{siteName}}</p>' },
      { siteName: 'Bloggs & Sons' },
    )
    expect(rendered.text).toContain('Bloggs & Sons')
    expect(rendered.text).not.toContain('&amp;')
  })

  it('keeps paragraphs apart rather than running them into one line', async () => {
    const rendered = await previewEmailTemplate(
      'member.verify-email',
      { bodyHtml: '<p>One.</p><p>Two.</p>' },
      {},
    )
    expect(rendered.text).toBe('One.\nTwo.')
  })
})
