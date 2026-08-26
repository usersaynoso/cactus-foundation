// The email wrapper's block set, as pure HTML producers.
//
// Email is not the web. Gmail strips <style> blocks in some clients, Outlook
// renders through Word, and *no* mail client resolves CSS custom properties -
// so none of the site's Puck blocks can be reused here: they are built on
// classes and var(--color-…), which arrive at the inbox as unstyled text. These
// blocks emit table-based markup with every rule inline instead.
//
// The site's design tokens still drive the defaults: a colour field holds a
// token id (resolved to that token's light-mode hex at send time), a literal
// hex, or '' for the block's own fallback. That keeps "colours are tokens" true
// at the point an owner picks one, while what leaves the building is the flat
// value email clients can actually read.
//
// No React and no client imports in this file: it is imported both by the Puck
// editor config (lib/puck/email-config.tsx) and by the send-time renderer
// (lib/email/render.ts). Both go through toHtml(), so what the editor previews
// is byte-for-byte what gets posted.

import { patternUrl } from '@/lib/puck/patternBackground'

export type EmailRenderContext = {
  /** The message itself, already interpolated. Dropped in by EmailBodySlot. */
  bodyHtml: string
  /** Merge values the wrapper may use too: siteName, siteUrl, logoUrl, year. */
  vars: Record<string, string>
  /** Design-token id to light-mode hex. */
  colours: Record<string, string>
  /** Resolved default font stack. */
  fontFamily: string
}

export type EmailBlockProps = Record<string, unknown>

const FALLBACK_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Merge-tag substitution. Unknown tags collapse to nothing so a stale
 * `{{tag}}` never reaches an inbox as literal braces.
 *
 * `rawTags` names the handful of tags whose value is markup the sending code
 * built itself - an order's item table, a quote's line rows. Everything else is
 * escaped, because merge values routinely carry text somebody typed. A tag only
 * belongs in rawTags if its value is assembled in code with its own escaping,
 * never passed through from a form. */
export function interpolate(
  template: string,
  vars: Record<string, string>,
  escape: boolean,
  rawTags?: ReadonlySet<string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined) return ''
    if (!escape || rawTags?.has(key)) return value
    return escapeHtml(value)
  })
}

function str(props: EmailBlockProps, key: string, fallback = ''): string {
  const v = props[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback
}

function num(props: EmailBlockProps, key: string, fallback: number): number {
  const v = props[key]
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

/** '' -> fallback, '#rrggbb'/'rgb(…)' -> itself, anything else -> token lookup. */
export function resolveColour(value: string | undefined, ctx: EmailRenderContext, fallback: string): string {
  const raw = (value ?? '').trim()
  if (!raw) return fallback
  if (raw.startsWith('#') || raw.startsWith('rgb') || raw.startsWith('hsl')) return raw
  return ctx.colours[raw] ?? fallback
}

/** Only ever used on href/src. Anything that isn't a plain http(s)/mailto/tel
 * link is dropped rather than emitted - an email is the one place a javascript:
 * URL is most likely to be clicked by someone who trusts the sender. */
function safeUrl(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value
  if (value.startsWith('/') || value.startsWith('{{')) return value
  return ''
}

type AlignValue = 'left' | 'center' | 'right'
function align(props: EmailBlockProps, key = 'align', fallback: AlignValue = 'left'): AlignValue {
  const v = str(props, key)
  return v === 'left' || v === 'center' || v === 'right' ? v : fallback
}

/** A padded <td> wrapper - the only spacing mechanism every client honours. */
function cell(inner: string, styles: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td style="${styles}">${inner}</td></tr></table>`
}

function paddingStyle(props: EmailBlockProps): string {
  const y = num(props, 'paddingY', 12)
  const x = num(props, 'paddingX', 24)
  return `padding:${y}px ${x}px;`
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type EmailBlockName =
  | 'EmailBodySlot'
  | 'EmailLogo'
  | 'EmailHeading'
  | 'EmailText'
  | 'EmailButton'
  | 'EmailImage'
  | 'EmailDivider'
  | 'EmailSpacer'
  | 'EmailTwoColumn'
  | 'EmailSocialRow'
  | 'EmailFooterText'

type BlockRenderer = (props: EmailBlockProps, ctx: EmailRenderContext) => string

export const EMAIL_BLOCK_HTML: Record<EmailBlockName, BlockRenderer> = {
  // The message. Everything else on the layout is decoration around this.
  EmailBodySlot: (props, ctx) => {
    const colour = resolveColour(str(props, 'textColour'), ctx, '#333333')
    const size = num(props, 'fontSize', 16)
    const body = ctx.bodyHtml || '<p>Your message appears here.</p>'
    return cell(
      `<div style="font-family:${ctx.fontFamily};font-size:${size}px;line-height:1.6;color:${colour};">${body}</div>`,
      paddingStyle(props),
    )
  },

  EmailLogo: (props, ctx) => {
    const src = safeUrl(interpolate(str(props, 'src') || '{{logoUrl}}', ctx.vars, false))
    const width = num(props, 'width', 160)
    const alt = escapeHtml(str(props, 'alt') || ctx.vars.siteName || '')
    const href = safeUrl(interpolate(str(props, 'href') || '{{siteUrl}}', ctx.vars, false))
    if (!src) {
      // No logo set and no site logo to fall back on: the site name in its place
      // beats a broken image icon at the top of every email.
      const colour = resolveColour(str(props, 'textColour'), ctx, '#111111')
      const label = escapeHtml(ctx.vars.siteName ?? '')
      if (!label) return ''
      const inner = `<span style="font-family:${ctx.fontFamily};font-size:20px;font-weight:700;color:${colour};">${label}</span>`
      return cell(href ? `<a href="${escapeHtml(href)}" style="text-decoration:none;color:${colour};">${inner}</a>` : inner, `${paddingStyle(props)}text-align:${align(props, 'align', 'center')};`)
    }
    const img = `<img src="${escapeHtml(src)}" alt="${alt}" width="${width}" style="display:inline-block;border:0;outline:none;max-width:100%;width:${width}px;height:auto;" />`
    const inner = href ? `<a href="${escapeHtml(href)}">${img}</a>` : img
    return cell(inner, `${paddingStyle(props)}text-align:${align(props, 'align', 'center')};`)
  },

  EmailHeading: (props, ctx) => {
    const text = interpolate(str(props, 'text'), ctx.vars, true)
    if (!text) return ''
    const level = str(props, 'level', 'h2')
    const size = num(props, 'fontSize', level === 'h1' ? 28 : level === 'h3' ? 18 : 22)
    const colour = resolveColour(str(props, 'textColour'), ctx, '#111111')
    const tag = level === 'h1' || level === 'h3' ? level : 'h2'
    return cell(
      `<${tag} style="margin:0;font-family:${ctx.fontFamily};font-size:${size}px;line-height:1.3;font-weight:700;color:${colour};text-align:${align(props)};">${text}</${tag}>`,
      paddingStyle(props),
    )
  },

  EmailText: (props, ctx) => {
    // Authored by an admin in the wrapper editor, so HTML is allowed here for
    // the same reason it is allowed in the message body itself.
    const html = interpolate(str(props, 'html'), ctx.vars, false)
    if (!html.trim()) return ''
    const size = num(props, 'fontSize', 16)
    const colour = resolveColour(str(props, 'textColour'), ctx, '#333333')
    return cell(
      `<div style="font-family:${ctx.fontFamily};font-size:${size}px;line-height:1.6;color:${colour};text-align:${align(props)};">${html}</div>`,
      paddingStyle(props),
    )
  },

  EmailButton: (props, ctx) => {
    const label = interpolate(str(props, 'label'), ctx.vars, true)
    const href = safeUrl(interpolate(str(props, 'href'), ctx.vars, false))
    if (!label || !href) return ''
    const bg = resolveColour(str(props, 'background'), ctx, ctx.colours.primary ?? '#111111')
    const fg = resolveColour(str(props, 'textColour'), ctx, '#ffffff')
    const radius = num(props, 'radius', 6)
    const size = num(props, 'fontSize', 16)
    // Nested table rather than a padded <a>: Outlook ignores padding on inline
    // elements, which turns a button into an underlined word.
    const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 auto;"><tr><td align="center" bgcolor="${escapeHtml(bg)}" style="border-radius:${radius}px;background-color:${bg};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;font-family:${ctx.fontFamily};font-size:${size}px;font-weight:600;line-height:1;color:${fg};text-decoration:none;border-radius:${radius}px;">${label}</a></td></tr></table>`
    return cell(`<div style="text-align:${align(props, 'align', 'center')};">${button}</div>`, paddingStyle(props))
  },

  EmailImage: (props, ctx) => {
    const src = safeUrl(interpolate(str(props, 'src'), ctx.vars, false))
    if (!src) return ''
    const alt = escapeHtml(str(props, 'alt'))
    const width = num(props, 'width', 520)
    const radius = num(props, 'radius', 0)
    const href = safeUrl(interpolate(str(props, 'href'), ctx.vars, false))
    const img = `<img src="${escapeHtml(src)}" alt="${alt}" width="${width}" style="display:block;border:0;outline:none;max-width:100%;width:${width}px;height:auto;${radius ? `border-radius:${radius}px;` : ''}" />`
    const inner = href ? `<a href="${escapeHtml(href)}">${img}</a>` : img
    return cell(`<div style="text-align:${align(props, 'align', 'center')};">${inner}</div>`, paddingStyle(props))
  },

  EmailDivider: (props, ctx) => {
    const colour = resolveColour(str(props, 'colour'), ctx, '#e5e5e5')
    const thickness = num(props, 'thickness', 1)
    return cell(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td style="font-size:0;line-height:0;height:${thickness}px;background-color:${colour};">&nbsp;</td></tr></table>`,
      paddingStyle(props),
    )
  },

  EmailSpacer: (props) => {
    const height = num(props, 'height', 24)
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td style="font-size:0;line-height:0;height:${height}px;">&nbsp;</td></tr></table>`
  },

  // Two side-by-side cells that fall back to full width in clients that ignore
  // the width attributes. Deliberately not a nested Puck slot: the send-time
  // walker stays flat, which is one fewer way for the editor and the inbox to
  // disagree.
  EmailTwoColumn: (props, ctx) => {
    const left = interpolate(str(props, 'leftHtml'), ctx.vars, false)
    const right = interpolate(str(props, 'rightHtml'), ctx.vars, false)
    if (!left.trim() && !right.trim()) return ''
    const size = num(props, 'fontSize', 15)
    const colour = resolveColour(str(props, 'textColour'), ctx, '#333333')
    const gap = num(props, 'gap', 16)
    const cellStyle = `font-family:${ctx.fontFamily};font-size:${size}px;line-height:1.6;color:${colour};vertical-align:top;`
    return cell(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;"><tr><td width="50%" style="${cellStyle}padding-right:${Math.round(gap / 2)}px;">${left}</td><td width="50%" style="${cellStyle}padding-left:${Math.round(gap / 2)}px;">${right}</td></tr></table>`,
      paddingStyle(props),
    )
  },

  EmailSocialRow: (props, ctx) => {
    const raw = props.links
    const links = Array.isArray(raw) ? raw : []
    const colour = resolveColour(str(props, 'textColour'), ctx, '#666666')
    const size = num(props, 'fontSize', 14)
    const items = links
      .map((entry) => {
        const link = (entry ?? {}) as EmailBlockProps
        const label = interpolate(str(link, 'label'), ctx.vars, true)
        const href = safeUrl(interpolate(str(link, 'href'), ctx.vars, false))
        if (!label || !href) return ''
        return `<a href="${escapeHtml(href)}" style="font-family:${ctx.fontFamily};font-size:${size}px;color:${colour};text-decoration:underline;padding:0 8px;">${label}</a>`
      })
      .filter(Boolean)
    if (!items.length) return ''
    return cell(`<div style="text-align:${align(props, 'align', 'center')};">${items.join('')}</div>`, paddingStyle(props))
  },

  EmailFooterText: (props, ctx) => {
    const html = interpolate(str(props, 'html'), ctx.vars, false)
    if (!html.trim()) return ''
    const colour = resolveColour(str(props, 'textColour'), ctx, '#888888')
    const size = num(props, 'fontSize', 12)
    return cell(
      `<div style="font-family:${ctx.fontFamily};font-size:${size}px;line-height:1.5;color:${colour};text-align:${align(props, 'align', 'center')};">${html}</div>`,
      paddingStyle(props),
    )
  },
}

export const EMAIL_BLOCK_NAMES = Object.keys(EMAIL_BLOCK_HTML) as EmailBlockName[]

// ---------------------------------------------------------------------------
// Document shell
// ---------------------------------------------------------------------------

export type EmailRootProps = EmailBlockProps

/** The page background, the centred card, and the font. Shared by the editor
 * preview (as the Puck root) and the send-time renderer. */
export function emailShell(root: EmailRootProps, ctx: EmailRenderContext, inner: string): string {
  const pageBg = resolveColour(str(root, 'pageBackground'), ctx, '#f4f4f5')
  const cardBg = resolveColour(str(root, 'cardBackground'), ctx, '#ffffff')
  const width = num(root, 'contentWidth', 600)
  const radius = num(root, 'cardRadius', 8)
  const outerPad = num(root, 'outerPadding', 24)
  const border = resolveColour(str(root, 'cardBorderColour'), ctx, '')
  const borderStyle = border ? `border:1px solid ${border};` : ''
  const pattern = emailPatternUrl(root)
  // The `background` ATTRIBUTE, not just the CSS: Outlook on Windows renders
  // through Word, which ignores background-image on a table but does tile the
  // old HTML attribute. Both are emitted so the pattern shows in either engine.
  const patternAttr = pattern ? ` background="${escapeHtml(pattern)}"` : ''

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"${patternAttr}${pattern ? ` class="${EMAIL_PATTERN_CLASS}"` : ''} style="border-collapse:collapse;width:100%;background-color:${pageBg};${emailPatternStyle(root)}margin:0;padding:0;"><tr><td align="center" style="padding:${outerPad}px 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="border-collapse:collapse;width:100%;max-width:${width}px;background-color:${cardBg};${radius ? `border-radius:${radius}px;` : ''}${borderStyle}overflow:hidden;"><tr><td style="padding:0;">${inner}</td></tr></table></td></tr></table>`
}

// ---------------------------------------------------------------------------
// Background pattern
// ---------------------------------------------------------------------------

// A tiling pattern behind the card, the email-shaped half of the same feature
// the Section/Hero/CTA Banner blocks carry on the site (lib/puck/patternBackground.ts).
// Three differences forced by the medium:
//
//  * The URL must be ABSOLUTE. An inbox has no origin to resolve `/media/...`
//    against, so a same-origin path - which the site blocks accept happily - is
//    refused here rather than sent as a broken image.
//  * There is no ::before. Email clients do not render pseudo-elements, so the
//    pattern is an inline background on the outer table (plus the `background`
//    attribute, for Word-engine Outlook).
//  * The size is one number of pixels, not a per-breakpoint value. Outlook
//    ignores background-size entirely and tiles at the image's natural size, so
//    the setting is a request rather than a promise - said plainly on the field.
export const EMAIL_PATTERN_CLASS = 'cactus-email-pattern'

/** The chosen pattern's absolute URL, or '' when there isn't a usable one. */
export function emailPatternUrl(root: EmailRootProps, key: 'patternImage' | 'patternImageDark' = 'patternImage'): string {
  return patternUrl(str(root, key), { requireAbsolute: true }) ?? ''
}

/** The tile size in whole pixels, 0 for "leave it at its own size". `dark: true`
 * reads the dark override and falls back to the light size when it is unset. */
export function emailPatternSize(root: EmailRootProps, { dark = false }: { dark?: boolean } = {}): number {
  const raw = dark ? num(root, 'patternSizeDark', 0) : num(root, 'patternSize', 0)
  const size = dark && raw <= 0 ? num(root, 'patternSize', 0) : raw
  return size > 0 ? Math.max(1, Math.round(size)) : 0
}

/** Inline background declarations for the pattern, or '' when there is none.
 * Always ends in `;` so it concatenates into a style attribute cleanly. */
export function emailPatternStyle(root: EmailRootProps): string {
  const url = emailPatternUrl(root)
  if (!url) return ''
  const size = emailPatternSize(root)
  // url() is left unquoted deliberately: this lands inside a double-quoted HTML
  // style attribute, and patternUrl has already refused any URL carrying a
  // quote, bracket, brace, angle bracket, backslash, semicolon or whitespace.
  // `0 0`, not `center`: centring a repeated background lands the tile grid on a
  // fractional pixel and hairline seams appear between the tiles (same reason as
  // the site's version - see lib/puck/patternBackground.ts).
  return `background-image:url(${url});background-repeat:repeat;background-position:0 0;${size > 0 ? `background-size:${size}px;` : ''}`
}

export const EMAIL_ROOT_DEFAULTS: EmailRootProps = {
  pageBackground: '',
  patternImage: '',
  patternImageDark: '',
  patternSize: 0,
  patternSizeDark: 0,
  cardBackground: '#ffffff',
  cardBorderColour: '',
  contentWidth: 600,
  cardRadius: 8,
  outerPadding: 24,
  fontFamily: '',
}

/** The font stack for an email. A token id resolves through the site fonts; a
 * literal stack is used verbatim; empty falls back to the system stack, because
 * a webfont that has to be downloaded is a webfont most clients will not load. */
export function resolveEmailFont(root: EmailRootProps, fonts: Record<string, string>): string {
  const raw = str(root, 'fontFamily').trim()
  if (!raw) return FALLBACK_FONT
  if (raw.includes(',') || raw.includes(' ')) return raw
  return fonts[raw] ?? FALLBACK_FONT
}
