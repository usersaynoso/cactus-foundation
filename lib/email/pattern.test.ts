import { describe, expect, it } from 'vitest'
import { emailShell, emailPatternStyle, emailPatternUrl, EMAIL_PATTERN_CLASS, type EmailRenderContext, type EmailRootProps } from '@/lib/email/blocks'
import { wrapEmailHtml } from '@/lib/email/wrapper'

const ctx: EmailRenderContext = { bodyHtml: '<p>body</p>', vars: {}, colours: {}, fontFamily: 'Arial' }

const wrap = (root: EmailRootProps) =>
  wrapEmailHtml({
    bodyHtml: '<p>body</p>',
    subject: 'Subject',
    vars: {},
    palette: { colours: {}, fonts: {} },
    layout: { id: 'l1', name: 'Wrapper', builderData: { root: { props: root }, content: [] }, publishedData: null },
  })

describe('email background pattern', () => {
  it('an email with no pattern is untouched', () => {
    expect(emailPatternStyle({})).toBe('')
    const html = wrap({})
    expect(html).not.toContain('background-image')
    expect(html).not.toContain(EMAIL_PATTERN_CLASS)
    // The long-standing light-only declaration stays put unless a dark pattern
    // opts the document into handling both schemes.
    expect(html).toContain('name="color-scheme" content="light"')
  })

  it('tiles the pattern, in CSS and in the Outlook attribute', () => {
    const shell = emailShell({ patternImage: 'https://cdn.example.com/dots.svg' }, ctx, '<p>x</p>')
    expect(shell).toContain('background-image:url(https://cdn.example.com/dots.svg)')
    expect(shell).toContain('background-repeat:repeat')
    // Centred repeats tile from a fractional pixel and show seams.
    expect(shell).toContain('background-position:0 0')
    expect(shell).not.toContain('background-position:center')
    // Word-engine Outlook ignores the CSS and tiles this instead.
    expect(shell).toContain('background="https://cdn.example.com/dots.svg"')
    expect(shell).toContain(`class="${EMAIL_PATTERN_CLASS}"`)
  })

  it('sizes the tile only when a size is set', () => {
    expect(emailPatternStyle({ patternImage: 'https://x.test/a.svg' })).not.toContain('background-size')
    expect(emailPatternStyle({ patternImage: 'https://x.test/a.svg', patternSize: 120 })).toContain('background-size:120px')
    expect(emailPatternStyle({ patternImage: 'https://x.test/a.svg', patternSize: 0 })).not.toContain('background-size')
    expect(emailPatternStyle({ patternImage: 'https://x.test/a.svg', patternSize: 120.6 })).toContain('background-size:121px')
  })

  it('refuses a relative path - an inbox has no origin to resolve it against', () => {
    expect(emailPatternUrl({ patternImage: '/media/dots.svg' })).toBe('')
    expect(emailPatternStyle({ patternImage: '/media/dots.svg' })).toBe('')
  })

  it('refuses a URL that could break out of the style attribute', () => {
    for (const bad of ['https://x.test/a.svg);color:red;(', 'https://x.test/a "b".svg', 'javascript:alert(1)']) {
      expect(emailPatternStyle({ patternImage: bad }), bad).toBe('')
    }
  })

  it('paints the body as well as the outer table, so a short email is covered', () => {
    const html = wrap({ patternImage: 'https://cdn.example.com/dots.svg' })
    expect(html).toContain(`<body class="${EMAIL_PATTERN_CLASS}"`)
    expect(html).toContain('background-image:url(https://cdn.example.com/dots.svg)')
  })

  it('sizes the dark tile differently when asked, with no dark image involved', () => {
    const html = wrap({ patternImage: 'https://cdn.example.com/dots.svg', patternSize: 120, patternSizeDark: 240 })
    expect(html).toContain('@media (prefers-color-scheme: dark)')
    expect(html).toContain('background-size:240px !important;')
    expect(html).toContain('name="color-scheme" content="light dark"')
  })

  it('leaves dark mode alone when the dark size matches the light one', () => {
    const html = wrap({ patternImage: 'https://cdn.example.com/dots.svg', patternSize: 120, patternSizeDark: 120 })
    expect(html).not.toContain('prefers-color-scheme')
  })

  it('adds the dark rule and the both-schemes declaration only when a dark pattern is set', () => {
    const light = wrap({ patternImage: 'https://cdn.example.com/light.svg' })
    expect(light).not.toContain('prefers-color-scheme')
    expect(light).toContain('name="color-scheme" content="light"')

    const dark = wrap({ patternImage: 'https://cdn.example.com/light.svg', patternImageDark: 'https://cdn.example.com/dark.svg' })
    expect(dark).toContain('@media (prefers-color-scheme: dark)')
    expect(dark).toContain(`.${EMAIL_PATTERN_CLASS}{background-image:url(https://cdn.example.com/dark.svg) !important;}`)
    expect(dark).toContain('name="color-scheme" content="light dark"')
    expect(dark).toContain('name="supported-color-schemes" content="light dark"')
  })

  it('ignores a dark pattern with no light one to swap out', () => {
    const html = wrap({ patternImageDark: 'https://cdn.example.com/dark.svg' })
    expect(html).not.toContain('prefers-color-scheme')
    expect(html).toContain('name="color-scheme" content="light"')
  })
})
