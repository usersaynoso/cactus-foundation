import { describe, it, expect } from 'vitest'
import { EMAIL_BLOCK_HTML, emailShell, interpolate, resolveColour, type EmailRenderContext } from '@/lib/email/blocks'
import { CORE_EMAIL_TEMPLATES, getEmailTemplateDef, listEmailTemplates, missingRequiredTags } from '@/lib/email/registry'

const ctx: EmailRenderContext = {
  bodyHtml: '<p>Hello</p>',
  vars: { siteName: 'Cactus & Co', siteUrl: 'https://example.com', logoUrl: 'https://cdn.example.com/logo.png', year: '2026' },
  colours: { primary: '#0055ff', text: '#222222' },
  fontFamily: 'Helvetica, Arial, sans-serif',
}

describe('email block HTML', () => {
  it('never emits a CSS variable - no mail client can resolve one', () => {
    const all = Object.values(EMAIL_BLOCK_HTML)
      .map((render) =>
        render(
          { text: 'Hi', html: '<p>Hi</p>', label: 'Go', href: 'https://example.com', src: 'https://example.com/a.png', links: [{ label: 'X', href: 'https://x.example' }], leftHtml: 'a', rightHtml: 'b' },
          ctx,
        ),
      )
      .join('')
    expect(all).not.toContain('var(--')
  })

  it('resolves a token id to its light-mode hex, passes a literal through, falls back when unknown', () => {
    expect(resolveColour('primary', ctx, '#000')).toBe('#0055ff')
    expect(resolveColour('#abcdef', ctx, '#000')).toBe('#abcdef')
    expect(resolveColour('no-such-token', ctx, '#000')).toBe('#000')
    expect(resolveColour('', ctx, '#000')).toBe('#000')
  })

  it('escapes merge values into text, so a site name with an ampersand cannot break the markup', () => {
    const html = EMAIL_BLOCK_HTML.EmailHeading({ text: '{{siteName}}' }, ctx)
    expect(html).toContain('Cactus &amp; Co')
    expect(html).not.toContain('Cactus & Co')
  })

  it('drops a javascript: link rather than rendering it', () => {
    const html = EMAIL_BLOCK_HTML.EmailButton({ label: 'Click', href: 'javascript:alert(1)' }, ctx)
    expect(html).toBe('')
    const img = EMAIL_BLOCK_HTML.EmailImage({ src: 'javascript:alert(1)' }, ctx)
    expect(img).toBe('')
  })

  it('puts the message through the body slot verbatim', () => {
    const html = EMAIL_BLOCK_HTML.EmailBodySlot({}, ctx)
    expect(html).toContain('<p>Hello</p>')
  })

  it('falls back to the site name when there is no logo image', () => {
    const html = EMAIL_BLOCK_HTML.EmailLogo({ src: '' }, { ...ctx, vars: { ...ctx.vars, logoUrl: '' } })
    expect(html).toContain('Cactus &amp; Co')
    expect(html).not.toContain('<img')
  })

  it('renders nothing for a block with nothing in it', () => {
    expect(EMAIL_BLOCK_HTML.EmailHeading({ text: '' }, ctx)).toBe('')
    expect(EMAIL_BLOCK_HTML.EmailText({ html: '   ' }, ctx)).toBe('')
    expect(EMAIL_BLOCK_HTML.EmailSocialRow({ links: [] }, ctx)).toBe('')
  })

  it('builds the shell around whatever it is given', () => {
    const shell = emailShell({ contentWidth: 640, cardBackground: '#fff' }, ctx, '<p>inner</p>')
    expect(shell).toContain('max-width:640px')
    expect(shell).toContain('<p>inner</p>')
    expect(shell).toContain('role="presentation"')
  })

  it('collapses an unknown merge tag rather than leaving braces in an inbox', () => {
    expect(interpolate('Hi {{nope}}!', ctx.vars, true)).toBe('Hi !')
  })
})

describe('email template registry', () => {
  it('has no duplicate keys', () => {
    const keys = listEmailTemplates().map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('ships every core template with a subject, a body and a group', () => {
    for (const t of CORE_EMAIL_TEMPLATES) {
      expect(t.subject.trim(), t.key).not.toBe('')
      expect(t.bodyHtml.trim(), t.key).not.toBe('')
      expect(t.groupLabel.trim(), t.key).not.toBe('')
    }
  })

  it('declares every required tag in its own default copy', () => {
    for (const t of CORE_EMAIL_TEMPLATES) {
      const def = getEmailTemplateDef(t.key)!
      expect(missingRequiredTags(def, t.subject, t.bodyHtml), t.key).toEqual([])
    }
  })

  it('catches an edit that has dropped a required tag', () => {
    const def = getEmailTemplateDef('auth.login-code')!
    expect(missingRequiredTags(def, 'Your code', '<p>Sign in.</p>')).toEqual(['code'])
    expect(missingRequiredTags(def, 'Your code: {{code}}', '<p>Sign in.</p>')).toEqual([])
  })

  it('keeps every account and security email transactional', () => {
    for (const t of CORE_EMAIL_TEMPLATES.filter((x) => x.key.startsWith('auth.'))) {
      expect(t.transactional, t.key).toBe(true)
    }
  })
})
