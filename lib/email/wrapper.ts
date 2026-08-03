import { prisma } from '@/lib/db/prisma'
import { paletteFromTokens, type EmailPalette } from '@/lib/email/palette'
import {
  EMAIL_BLOCK_HTML,
  EMAIL_ROOT_DEFAULTS,
  emailShell,
  escapeHtml,
  interpolate,
  resolveEmailFont,
  type EmailBlockName,
  type EmailBlockProps,
  type EmailRenderContext,
  type EmailRootProps,
} from '@/lib/email/blocks'

// Turns an `emailWrapper` Layout's Puck data into the HTML document an email
// client receives, with the message dropped into its EmailBodySlot.
//
// Nothing here renders React. Puck's <Render> would need react-dom/server and
// would emit the site's class-based markup; email wants flat inline styles, so
// the walk below maps each block straight to its toHtml() twin. That twin is
// the same function the editor previews through, which is what keeps the two
// honest (see lib/email/blocks.ts).

type PuckItem = { type?: string; props?: EmailBlockProps }
type PuckData = { root?: { props?: EmailRootProps }; content?: PuckItem[] }

export type EmailWrapperLayout = {
  id: string
  name: string
  builderData: unknown
  publishedData: unknown
}

const WRAPPER_SELECT = { id: true, name: true, builderData: true, publishedData: true } as const

/** Every published wrapper, best first. The "default" wrapper is simply the
 * winner of this ordering - same priority-then-recency tiebreak the theme
 * layouts use, so an owner promotes a wrapper the way they already know how. */
export async function listPublishedEmailWrappers(): Promise<EmailWrapperLayout[]> {
  return prisma.layout
    .findMany({
      where: { type: 'emailWrapper', status: 'published' },
      select: WRAPPER_SELECT,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    })
    .catch(() => [])
}

export async function resolveEmailWrapper(wrapperLayoutId: string | null): Promise<EmailWrapperLayout | null> {
  if (wrapperLayoutId) {
    const chosen = await prisma.layout
      .findFirst({ where: { id: wrapperLayoutId, type: 'emailWrapper' }, select: WRAPPER_SELECT })
      .catch(() => null)
    // A wrapper that has been deleted (or unpublished, or had its type changed)
    // must not take the email down with it - fall through to the default.
    if (chosen) return chosen
  }
  const published = await listPublishedEmailWrappers()
  return published[0] ?? null
}

// ---------------------------------------------------------------------------
// Site palette
// ---------------------------------------------------------------------------

export type { EmailPalette }

export async function getEmailPalette(): Promise<EmailPalette> {
  const config = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { designTokens: true } })
    .catch(() => null)
  return paletteFromTokens(config?.designTokens)
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function pickWrapperData(layout: EmailWrapperLayout | null): PuckData | null {
  if (!layout) return null
  const data = (layout.publishedData ?? layout.builderData) as PuckData | null
  if (!data || typeof data !== 'object') return null
  return data
}

/** The wrapper body: every block in order, with unknown block types skipped
 * rather than guessed at. */
export function renderWrapperInner(data: PuckData, ctx: EmailRenderContext): string {
  const items = Array.isArray(data.content) ? data.content : []
  const parts: string[] = []
  let sawBodySlot = false
  for (const item of items) {
    const name = item?.type as EmailBlockName | undefined
    if (!name) continue
    const renderer = EMAIL_BLOCK_HTML[name]
    if (!renderer) continue
    if (name === 'EmailBodySlot') sawBodySlot = true
    parts.push(renderer(item.props ?? {}, ctx))
  }
  // A wrapper an owner has built without a message block would send a beautiful
  // empty email. Append the message rather than drop it.
  if (!sawBodySlot) parts.push(EMAIL_BLOCK_HTML.EmailBodySlot({}, ctx))
  return parts.join('')
}

function documentShell(inner: string, ctx: EmailRenderContext, root: EmailRootProps, title: string): string {
  const preheaderRaw = typeof root.preheader === 'string' ? root.preheader : ''
  const preheader = preheaderRaw ? interpolate(preheaderRaw, ctx.vars, true) : ''
  // Hidden preview line: what the inbox list shows next to the subject. The
  // trailing filler stops the client borrowing the first line of the body.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}${'&#847;&zwnj;&nbsp;'.repeat(30)}</div>`
    : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /><meta name="supported-color-schemes" content="light" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:${resolvePageBackground(root, ctx)};-webkit-font-smoothing:antialiased;">${preheaderHtml}${inner}</body></html>`
}

function resolvePageBackground(root: EmailRootProps, ctx: EmailRenderContext): string {
  const raw = typeof root.pageBackground === 'string' ? root.pageBackground.trim() : ''
  if (!raw) return '#f4f4f5'
  if (raw.startsWith('#') || raw.startsWith('rgb') || raw.startsWith('hsl')) return raw
  return ctx.colours[raw] ?? '#f4f4f5'
}

export type WrapEmailArgs = {
  bodyHtml: string
  subject: string
  vars: Record<string, string>
  palette: EmailPalette
  layout: EmailWrapperLayout | null
}

/** Wraps a rendered message in its design. With no wrapper layout on the site
 * this still returns a tidy centred card - a plain unstyled body would be a
 * regression on what core sent before wrappers existed. */
export function wrapEmailHtml({ bodyHtml, subject, vars, palette, layout }: WrapEmailArgs): string {
  const data = pickWrapperData(layout)
  const root: EmailRootProps = { ...EMAIL_ROOT_DEFAULTS, ...(data?.root?.props ?? {}) }
  const ctx: EmailRenderContext = {
    bodyHtml,
    vars,
    colours: palette.colours,
    fontFamily: resolveEmailFont(root, palette.fonts),
  }
  const inner = data ? renderWrapperInner(data, ctx) : EMAIL_BLOCK_HTML.EmailBodySlot({}, ctx)
  return documentShell(emailShell(root, ctx, inner), ctx, root, subject)
}
