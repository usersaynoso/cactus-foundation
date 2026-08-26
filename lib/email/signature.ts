import {
  EMAIL_BLOCK_HTML,
  EMAIL_ROOT_DEFAULTS,
  resolveColour,
  resolveEmailFont,
  type EmailBlockName,
  type EmailBlockProps,
  type EmailRenderContext,
  type EmailRootProps,
} from '@/lib/email/blocks'

// A signature built out of the same email blocks a wrapper uses, rendered to the
// table that gets appended to a message.
//
// Deliberately NOT a wrapper: no page background, no centred card, no document
// shell. A signature is a fragment that lands inside somebody else's email body,
// so it renders left-aligned at its own width and inherits everything around it.
//
// Kept free of prisma (and of anything else server-only) on purpose: the Puck
// editor canvas imports these defaults so its preview matches the sent article,
// and that import runs in the browser.

type PuckItem = { type?: string; props?: EmailBlockProps }
export type EmailSignatureData = { root?: { props?: EmailRootProps }; content?: PuckItem[] }

export const EMAIL_SIGNATURE_ROOT_DEFAULTS: EmailRootProps = {
  ...EMAIL_ROOT_DEFAULTS,
  background: '',
  contentWidth: 520,
  fontFamily: '',
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

/** The signature's own outer table. Width is a max, not a fix - a phone client
 * with a 320px viewport has to be able to shrink it. */
export function emailSignatureShell(root: EmailRootProps, ctx: EmailRenderContext, inner: string): string {
  const width = num(root, 'contentWidth', 520)
  const background = resolveColour(str(root, 'background'), ctx, '')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="border-collapse:collapse;width:100%;max-width:${width}px;${background ? `background-color:${background};` : ''}"><tr><td style="padding:0;">${inner}</td></tr></table>`
}

/** Every block in order. EmailBodySlot is skipped rather than rendered: it means
 * "the message goes here", and a signature is already inside the message - one
 * dropped onto the canvas by mistake would paste the whole reply in twice. */
export function renderSignatureInner(data: EmailSignatureData, ctx: EmailRenderContext): string {
  const items = Array.isArray(data.content) ? data.content : []
  const parts: string[] = []
  for (const item of items) {
    const name = item?.type as EmailBlockName | undefined
    if (!name || name === 'EmailBodySlot') continue
    const renderer = EMAIL_BLOCK_HTML[name]
    if (!renderer) continue
    parts.push(renderer(item.props ?? {}, ctx))
  }
  return parts.join('')
}

export type RenderSignatureArgs = {
  data: EmailSignatureData | null
  /** Merge values the blocks may interpolate: siteName, siteUrl, logoUrl, year,
   * plus whatever the caller adds. */
  vars: Record<string, string>
  colours: Record<string, string>
  fonts: Record<string, string>
}

/** The signature's HTML, or '' when there is nothing to render. */
export function renderEmailSignatureHtml({ data, vars, colours, fonts }: RenderSignatureArgs): string {
  if (!data || typeof data !== 'object') return ''
  const root: EmailRootProps = { ...EMAIL_SIGNATURE_ROOT_DEFAULTS, ...(data.root?.props ?? {}) }
  const ctx: EmailRenderContext = {
    // Nothing to slot in: the slot block is skipped above, and no other block
    // reads this.
    bodyHtml: '',
    vars,
    colours,
    fontFamily: resolveEmailFont(root, fonts),
  }
  const inner = renderSignatureInner(data, ctx)
  if (!inner) return ''
  return emailSignatureShell(root, ctx, inner)
}
