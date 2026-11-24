import { describe, expect, it } from 'vitest'
import {
  EMAIL_LINKS_CLASS,
  emailLinkHeadCss,
  emailLinkStyle,
  resolveEmailLinkColour,
  styleEmailLinks,
  type EmailLinkStyle,
} from '@/lib/email/links'
import { EMAIL_BLOCK_HTML, interpolate } from '@/lib/email/blocks'
import { listEmailTemplates } from '@/lib/email/registry'
import { applyConditionals } from '@/lib/email/render'
import { wrapEmailHtml } from '@/lib/email/wrapper'

const GOLD: EmailLinkStyle = { colour: '#e0b04a', decoration: '' }
const UNSET: EmailLinkStyle = { colour: '', decoration: '' }

describe('styleEmailLinks', () => {
  it('adds an inline colour to a bare link', () => {
    expect(styleEmailLinks('<p><a href="https://x.test">x</a></p>', GOLD)).toBe('<p><a style="color:#e0b04a;" href="https://x.test">x</a></p>')
  })

  it('adds the colour inside an existing style that has none', () => {
    expect(styleEmailLinks('<a href="/a" style="font-weight:bold">a</a>', GOLD)).toBe('<a href="/a" style="color:#e0b04a;font-weight:bold">a</a>')
    expect(styleEmailLinks("<a style='font-weight:bold' href=\"/a\">a</a>", GOLD)).toBe("<a style='color:#e0b04a;font-weight:bold' href=\"/a\">a</a>")
    expect(styleEmailLinks('<a style=font-weight:bold href="/a">a</a>', GOLD)).toBe('<a style="color:#e0b04a;font-weight:bold" href="/a">a</a>')
  })

  it('leaves a link that already sets its own colour alone - buttons included', () => {
    const own = '<a href="/a" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;">Go</a>'
    expect(styleEmailLinks(own, GOLD)).toBe(own)
    expect(styleEmailLinks('<a href="/a" style="COLOR : red">a</a>', GOLD)).toBe('<a href="/a" style="COLOR : red">a</a>')
    const button = EMAIL_BLOCK_HTML.EmailButton({ label: 'Go', href: 'https://x.test' }, { bodyHtml: '', vars: {}, colours: {}, fontFamily: 'Arial' })
    expect(styleEmailLinks(button, { colour: '#e0b04a', decoration: 'underline' })).toBe(button)
  })

  it('does not mistake background-color for a text colour', () => {
    expect(styleEmailLinks('<a href="/a" style="background-color:#000">a</a>', GOLD)).toBe('<a href="/a" style="color:#e0b04a;background-color:#000">a</a>')
  })

  it('copes with nested tags, odd attribute order, uppercase and multi-line tags', () => {
    expect(styleEmailLinks('<A HREF="/a"><strong>b</strong></A>', GOLD)).toBe('<A style="color:#e0b04a;" HREF="/a"><strong>b</strong></A>')
    expect(styleEmailLinks('<a\n  target="_blank"\n  href="/a">x</a>', GOLD)).toBe('<a style="color:#e0b04a;"\n  target="_blank"\n  href="/a">x</a>')
    expect(styleEmailLinks('<a title="a > b" STYLE="margin:0" href="/a">x</a>', GOLD)).toBe('<a title="a > b" STYLE="color:#e0b04a;margin:0" href="/a">x</a>')
    // A style-looking string inside another attribute is not the style attribute.
    expect(styleEmailLinks('<a title="style=color:red" href="/a">x</a>', GOLD)).toBe('<a style="color:#e0b04a;" title="style=color:red" href="/a">x</a>')
    expect(styleEmailLinks('<a data-style="color:red" href="/a">x</a>', GOLD)).toBe('<a style="color:#e0b04a;" data-style="color:red" href="/a">x</a>')
  })

  it('never touches tags that merely start with a', () => {
    const html = '<abbr title="x">x</abbr><address>y</address><area href="/z" /><aside>q</aside>'
    expect(styleEmailLinks(html, GOLD)).toBe(html)
  })

  it('returns HTML with no links unchanged', () => {
    expect(styleEmailLinks('<p>No links here, only <b>bold</b>.</p>', GOLD)).toBe('<p>No links here, only <b>bold</b>.</p>')
    expect(styleEmailLinks('', GOLD)).toBe('')
  })

  it('sets the underline only where the link has not said otherwise', () => {
    const on: EmailLinkStyle = { colour: '', decoration: 'underline' }
    const off: EmailLinkStyle = { colour: '#e0b04a', decoration: 'none' }
    expect(styleEmailLinks('<a href="/a">a</a>', on)).toBe('<a style="text-decoration:underline;" href="/a">a</a>')
    expect(styleEmailLinks('<a href="/a">a</a>', off)).toBe('<a style="color:#e0b04a;text-decoration:none;" href="/a">a</a>')
    expect(styleEmailLinks('<a href="/a" style="text-decoration:none">a</a>', on)).toBe('<a href="/a" style="text-decoration:none">a</a>')
    // A link with its own colour still takes the underline setting when it has none.
    expect(styleEmailLinks('<a href="/a" style="color:red">a</a>', on)).toBe('<a href="/a" style="text-decoration:underline;color:red">a</a>')
  })

  it('is the identity when nothing is set', () => {
    const html = '<p><a href="/a">a</a><A HREF="/b" style="x:y">b</A></p>'
    expect(styleEmailLinks(html, UNSET)).toBe(html)
  })
})

describe('link colour settings', () => {
  const colours = { primary: '#2c7558', odd: 'oklch(0.5 0.1 120)', short: '#abc' }

  it('accepts a hex or a site colour that resolves to one', () => {
    expect(resolveEmailLinkColour('#E0B04A', colours)).toBe('#e0b04a')
    expect(resolveEmailLinkColour(' #abc ', colours)).toBe('#abc')
    expect(resolveEmailLinkColour('primary', colours)).toBe('#2c7558')
    expect(resolveEmailLinkColour('short', colours)).toBe('#abc')
  })

  it('refuses anything that is not plainly a hex colour', () => {
    for (const bad of ['', 'red', '#ggg', '#12345', 'odd', 'nope', '#fff;background:url(x)', '#fff" onmouseover="x', 'rgb(1,2,3)', 'var(--color-1)', '#fff}a{color:red']) {
      expect(resolveEmailLinkColour(bad, colours), bad).toBe('')
    }
    expect(resolveEmailLinkColour(42 as unknown, colours)).toBe('')
  })

  it('reads the root props, with the underline limited to its two values', () => {
    expect(emailLinkStyle({ linkColour: 'primary', linkUnderline: 'underline' }, colours)).toEqual({ colour: '#2c7558', decoration: 'underline' })
    expect(emailLinkStyle({ linkUnderline: 'none' }, colours)).toEqual({ colour: '', decoration: 'none' })
    expect(emailLinkStyle({ linkUnderline: 'blink' }, colours)).toEqual(UNSET)
    expect(emailLinkStyle({}, colours)).toEqual(UNSET)
  })

  it('writes a head rule only when something is set', () => {
    expect(emailLinkHeadCss(UNSET)).toBe('')
    expect(emailLinkHeadCss({ colour: '#e0b04a', decoration: 'underline' })).toBe(`<style>.${EMAIL_LINKS_CLASS} a{color:#e0b04a;text-decoration:underline;}</style>`)
  })
})

// ---------------------------------------------------------------------------
// The whole document
// ---------------------------------------------------------------------------

const wrapperWith = (root: Record<string, unknown>) => ({
  id: 'w',
  name: 'Wrapper',
  publishedData: null,
  builderData: {
    root: { props: { cardBackground: '#1f2a24', ...root } },
    content: [
      { type: 'EmailText', props: { html: '<p><a href="https://x.test">wrapper link</a></p>' } },
      { type: 'EmailBodySlot', props: { textColour: '#dddddd' } },
      { type: 'EmailButton', props: { label: 'Go', href: 'https://x.test' } },
      { type: 'EmailFooterText', props: { html: '<a href="{{siteUrl}}">site</a>' } },
    ],
  },
})

function renderEveryTemplate(layout: ReturnType<typeof wrapperWith> | null): string[] {
  const palette = { colours: { primary: '#2c7558', gold: '#e0b04a' }, fonts: {} }
  return listEmailTemplates().map((t) => {
    const vars: Record<string, string> = { siteName: 'Site', siteUrl: 'https://example.com', logoUrl: '', year: '2026' }
    for (const tag of t.mergeTags) if (!(tag in vars)) vars[tag] = `https://example.com/${tag}`
    const body = interpolate(applyConditionals(t.bodyHtml, vars), vars, true, new Set(t.rawTags ?? []))
    return wrapEmailHtml({ bodyHtml: body, subject: t.subject, vars, palette, layout })
  })
}

describe('link colour in a sent email', () => {
  it('leaves every template byte-for-byte as it was when no link style is set', () => {
    const before = renderEveryTemplate(wrapperWith({}))
    const blank = renderEveryTemplate(wrapperWith({ linkColour: '', linkUnderline: '' }))
    const junk = renderEveryTemplate(wrapperWith({ linkColour: 'not-a-colour', linkUnderline: 'sideways' }))
    expect(blank).toEqual(before)
    expect(junk).toEqual(before)
    for (const html of before) {
      expect(html).not.toContain(EMAIL_LINKS_CLASS)
      expect(html).not.toContain('<a style=')
    }
  })

  it('colours every unstyled link on the card and leaves the button its own colours', () => {
    const html = renderEveryTemplate(wrapperWith({ linkColour: 'gold', linkUnderline: 'underline' })).join('\n')
    // No bare link survives anywhere on the card.
    expect(html).not.toMatch(/<a href="[^"]*">/)
    expect(html).toContain('<a style="color:#e0b04a;text-decoration:underline;" href="https://x.test">wrapper link</a>')
    expect(html).toContain('<a style="color:#e0b04a;text-decoration:underline;" href="https://example.com">site</a>')
    // The button keeps white text and no underline.
    expect(html).toMatch(/<a href="https:\/\/x\.test" style="display:inline-block;[^"]*color:#ffffff;text-decoration:none;/)
    // Backup rule in the head, scoped to the card that carries the class.
    expect(html).toContain(`<style>.${EMAIL_LINKS_CLASS} a{color:#e0b04a;text-decoration:underline;}</style></head>`)
    expect(html).toContain(`class="${EMAIL_LINKS_CLASS}"`)
  })

  it('styles the message links of the verify-email template', () => {
    const verify = listEmailTemplates().find((t) => t.key === 'member.verify-email')!
    const vars = { siteName: 'S', siteUrl: '', logoUrl: '', year: '2026', verifyUrl: 'https://example.com/v?t=1' }
    const html = wrapEmailHtml({
      bodyHtml: interpolate(verify.bodyHtml, vars, true),
      subject: 'x',
      vars,
      palette: { colours: {}, fonts: {} },
      layout: wrapperWith({ linkColour: '#E0B04A' }),
    })
    expect(html).toContain('<a style="color:#e0b04a;" href="https://example.com/v?t=1">')
  })

  it('cannot be used to inject CSS or markup', () => {
    const html = renderEveryTemplate(wrapperWith({ linkColour: '#fff;}</style><script>x</script>' }))[0]
    expect(html).not.toContain('<script>')
    expect(html).not.toContain(EMAIL_LINKS_CLASS)
  })
})
