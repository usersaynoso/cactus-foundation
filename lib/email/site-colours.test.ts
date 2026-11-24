import { describe, expect, it } from 'vitest'
import { EMAIL_BLOCK_HTML, emailShell, resolveColour, type EmailRenderContext } from '@/lib/email/blocks'
import { paletteFromTokens } from '@/lib/email/palette'
import { resolveEmailLinkColour } from '@/lib/email/links'
import { wrapEmailHtml } from '@/lib/email/wrapper'
import { DEFAULT_DESIGN_TOKENS } from '@/lib/design/tokens'

// The email colour fields now use the site colour picker, which stores a picked
// swatch as `var(--color-N)` (and a dark override as light-dark(...)). No inbox
// resolves a CSS variable, so every one of those has to leave as a flat hex.

const tokens = {
  designSystem: {
    colours: [
      { id: 'primary', name: 'Primary', light: '#2c7558', dark: '#459578' },
      { id: 'secondary', name: 'Secondary', light: '#ffffff', dark: '#0f172a' },
      { id: 'gold', name: 'Gold', light: '#e0b04a', dark: '#f0c060' },
    ],
    fonts: [],
  },
}
const palette = paletteFromTokens(tokens)
const ctx: EmailRenderContext = { bodyHtml: '<p><a href="https://x.test">x</a></p>', vars: {}, colours: palette.colours, fontFamily: 'Arial' }

describe('site colours in email', () => {
  it('maps each picker slot to its light hex, numbered as the CSS variables are', () => {
    expect(palette.colours['var(--color-1)']).toBe('#2c7558')
    expect(palette.colours['var(--color-3)']).toBe('#e0b04a')
    expect(palette.colours.primary).toBe('#2c7558')
    // The default tokens get the same treatment.
    expect(paletteFromTokens(DEFAULT_DESIGN_TOKENS).colours['var(--color-1)']).toBe(DEFAULT_DESIGN_TOKENS.designSystem.colours[0]?.light)
  })

  it('resolves a picked swatch, with or without a dark arm, to the light hex', () => {
    expect(resolveColour('var(--color-3)', ctx, '#000')).toBe('#e0b04a')
    expect(resolveColour('light-dark(var(--color-1), var(--color-2))', ctx, '#000')).toBe('#2c7558')
    expect(resolveColour('light-dark(#123456, #abcdef)', ctx, '#000')).toBe('#123456')
    // A slot the site does not have falls back rather than sending var().
    expect(resolveColour('var(--color-12)', ctx, '#000')).toBe('#000')
  })

  it('keeps every older stored value exactly as it rendered before', () => {
    expect(resolveColour('#AbC123', ctx, '#000')).toBe('#AbC123')
    expect(resolveColour(' #fff ', ctx, '#000')).toBe('#fff')
    expect(resolveColour('rgb(0 0 0 / 50%)', ctx, '#000')).toBe('rgb(0 0 0 / 50%)')
    expect(resolveColour('primary', ctx, '#000')).toBe('#2c7558')
    expect(resolveColour('', ctx, '#000')).toBe('#000')
    expect(resolveColour('#333;', ctx, '#000')).toBe('#333')
  })

  it('refuses a value that could break out of the style attribute', () => {
    for (const bad of ['#fff" onclick="x', '#fff;background:url(x)', 'red}a{', '#fff<script>', "#fff'"]) {
      expect(resolveColour(bad, ctx, '#000'), bad).toBe('#000')
    }
  })

  it('never lets a CSS variable reach the email', () => {
    const blocks = Object.values(EMAIL_BLOCK_HTML)
      .map((render) =>
        render(
          {
            text: 'Hi', html: '<p>Hi</p>', label: 'Go', href: 'https://example.com', links: [{ label: 'X', href: 'https://x.example' }], leftHtml: 'a', rightHtml: 'b',
            textColour: 'var(--color-1)', background: 'light-dark(var(--color-3), var(--color-1))', colour: 'var(--color-2)',
          },
          ctx,
        ),
      )
      .join('')
    expect(blocks).not.toContain('var(')
    expect(blocks).toContain('color:#2c7558')
    expect(blocks).toContain('background-color:#e0b04a')
    const shell = emailShell({ pageBackground: 'var(--color-1)', cardBackground: 'var(--color-2)', cardBorderColour: 'var(--color-3)' }, ctx, '')
    expect(shell).not.toContain('var(')
    expect(shell).toContain('background-color:#2c7558')
    expect(shell).toContain('border:1px solid #e0b04a')
  })

  it('resolves the wrapper root colours, link colour included, through the whole document', () => {
    const html = wrapEmailHtml({
      bodyHtml: ctx.bodyHtml,
      subject: 'S',
      vars: {},
      palette,
      layout: {
        id: 'w', name: 'W', publishedData: null,
        builderData: { root: { props: { pageBackground: 'var(--color-1)', cardBackground: 'light-dark(var(--color-2), #000000)', linkColour: 'var(--color-3)' } }, content: [] },
      },
    })
    expect(html).not.toContain('var(')
    expect(html).toContain('<body style="margin:0;padding:0;background-color:#2c7558;')
    expect(html).toContain('<a style="color:#e0b04a;" href="https://x.test">')
    expect(resolveEmailLinkColour('light-dark(var(--color-3), #000)', palette.colours)).toBe('#e0b04a')
  })
})
