import { prisma } from '@/lib/db/prisma'
import { getEmailTemplateDef, missingRequiredTags, type RegisteredEmailTemplate } from '@/lib/email/registry'
import { escapeHtml, interpolate } from '@/lib/email/blocks'
import { getEmailPalette, resolveEmailWrapper, wrapEmailHtml } from '@/lib/email/wrapper'
import { emailLogoUrl } from '@/lib/email/logo'

// Renders one registered email: code default, overlaid with the admin's edit if
// there is one, interpolated, then dropped into its wrapper design.
//
// Deliberately does no sending. lib/email/index.ts owns the transport and calls
// in here, which keeps the two files acyclic and means a preview in the admin
// takes exactly the same path as the real thing minus the last step.

export type RenderedEmail = { subject: string; html: string; text: string }

export type TemplateOverride = {
  subject: string | null
  bodyHtml: string | null
  wrapperLayoutId: string | null
  isActive: boolean
}

/** `{{#if flag}}…{{/if}}` - one conditional, matching what the shop templates
 * already used before they moved in here. `flag` must be the literal string
 * 'true' in vars for the block to survive. */
export function applyConditionals(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key: string, inner: string) => {
    return vars[key] === 'true' ? inner : ''
  })
}

export async function getTemplateOverride(key: string): Promise<TemplateOverride | null> {
  const row = await prisma.emailTemplate
    .findUnique({
      where: { key },
      select: { subject: true, bodyHtml: true, wrapperLayoutId: true, isActive: true },
    })
    .catch(() => null)
  return row ?? null
}

// ---------------------------------------------------------------------------
// Site-level merge values
// ---------------------------------------------------------------------------

export type SiteEmailContext = {
  siteName: string
  siteUrl: string
  logoUrl: string
  year: string
}

/** The merge tags every render fills in from the site record itself, whoever
 * the caller is. Kept as a set because a preview has to leave them alone. */
const SITE_CONTEXT_TAGS: ReadonlySet<string> = new Set(['siteName', 'siteUrl', 'logoUrl', 'year'])

export async function getSiteEmailContext(): Promise<SiteEmailContext> {
  const config = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { siteName: true, logoMediaId: true } })
    .catch(() => null)
  const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '')
  const logo = config?.logoMediaId
    ? await prisma.media
        .findUnique({ where: { id: config.logoMediaId }, select: { id: true, url: true, mimeType: true } })
        .catch(() => null)
    : null
  return {
    siteName: config?.siteName ?? 'Cactus Foundation',
    siteUrl,
    // Not simply the logo's own URL: an SVG or a WebP is a blank space in half
    // the world's inboxes. See lib/email/logo.ts.
    logoUrl: emailLogoUrl(logo, siteUrl),
    // Rendered fresh per send so a footer copyright line never goes stale.
    year: String(new Date().getFullYear()),
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

type RenderInput = {
  def: RegisteredEmailTemplate
  subjectTemplate: string
  bodyTemplate: string
  wrapperLayoutId: string | null
  vars: Record<string, string>
}

async function renderResolved({ def, subjectTemplate, bodyTemplate, wrapperLayoutId, vars }: RenderInput): Promise<RenderedEmail> {
  const site = await getSiteEmailContext()
  // Caller-supplied values win: a template that passes its own siteName (the
  // members senders all do) must not be second-guessed by the site record.
  const merged: Record<string, string> = {
    siteName: site.siteName,
    siteUrl: site.siteUrl,
    logoUrl: site.logoUrl,
    year: site.year,
    ...vars,
  }

  const subjectWithConditionals = applyConditionals(subjectTemplate, merged)
  const bodyWithConditionals = applyConditionals(bodyTemplate, merged)

  const subject = interpolate(subjectWithConditionals, merged, false)
  // Merge values may carry user-supplied text (a suspension reason, a product
  // name), so they are escaped into the body. The template's own markup is
  // admin-authored and passes through, as do the few tags a template declares
  // as pre-built markup of its own (rawTags).
  const rawTags = def.rawTags?.length ? new Set(def.rawTags) : undefined
  const body = interpolate(bodyWithConditionals, merged, true, rawTags)

  const [palette, layout] = await Promise.all([
    getEmailPalette(),
    resolveEmailWrapper(wrapperLayoutId),
  ])

  return {
    subject,
    // Off the *body* only - a plain-text reader wants the message, not a
    // flattened rendering of the header, footer and social row.
    text: htmlToPlainText(body),
    html: wrapEmailHtml({ bodyHtml: body, subject, vars: merged, palette, layout }),
  }
}

/**
 * The plain-text alternative, made from the finished HTML body.
 *
 * Two things were wrong with making it from the TEMPLATE instead, which is what
 * this used to do:
 *
 * 1. Tags were stripped before the merge values went in, so an anchor's href
 *    went with the tag and the address it pointed at never reached the text
 *    part at all. Every "click here to confirm" email said click here and gave
 *    a plain-text reader nothing to click - which is most of what this module's
 *    emails are FOR. Space Planner works round it by printing a visible url
 *    beside the link; nothing else did.
 * 2. Merge values were then interpolated in unescaped, so a product name or a
 *    typed reason containing a tag landed as markup in text/plain.
 *
 * Working from the rendered body fixes both at once, provided the order is
 * kept: links out first, then tags away, and only then entities decoded. Decode
 * before stripping and an escaped `&lt;b&gt;` in somebody's typed text becomes
 * a real tag one line before the stripper runs, which is the second bug again
 * wearing a hat.
 */
export function htmlToPlainText(html: string): string {
  const withLinks = html
    // Anything that carries meaning by being a separate line becomes one.
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|table|blockquote)\s*>/gi, '\n')
    .replace(/<\s*hr\s*\/?\s*>/gi, '\n---\n')
    // "Open your layout (https://…)" - unless the label already IS the address,
    // in which case saying it twice is worse than not saying it once.
    .replace(
      /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
      (_match, _quote: string, href: string, inner: string) => {
        const label = inner.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
        const url = href.trim()
        if (!url || url.startsWith('mailto:') || decodeEntities(label) === decodeEntities(url)) return label || url
        return `${label} (${url})`
      },
    )

  const stripped = withLinks.replace(/<[^>]*>/g, ' ')

  return decodeEntities(stripped)
    // Tabs and stray carriage returns collapse; newlines are load-bearing here.
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  pound: '£',
  hellip: '…',
  mdash: '-',
  ndash: '-',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
}

/** The handful escapeHtml produces, plus the ones template authors actually type. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return ENTITIES[body.toLowerCase()] ?? match
  })
}

/**
 * Null means "this email is switched off" - the admin has untoggled a
 * non-transactional template, and the caller should quietly not send. An
 * unknown key is a programming error and throws, because the alternative is an
 * email that silently stops going out after a rename.
 */
export async function renderEmailTemplate(key: string, vars: Record<string, string> = {}): Promise<RenderedEmail | null> {
  const def = getEmailTemplateDef(key)
  if (!def) throw new Error(`Unknown email template: ${key}`)

  const override = await getTemplateOverride(key)
  if (override && !override.isActive && !def.transactional) return null

  return renderResolved({
    def,
    subjectTemplate: override?.subject ?? def.subject,
    bodyTemplate: override?.bodyHtml ?? def.bodyHtml,
    wrapperLayoutId: override?.wrapperLayoutId ?? null,
    vars,
  })
}

/** Same path as a real send, but with unsaved editor content and sample merge
 * values - what the admin's preview and test-send both go through. */
export async function previewEmailTemplate(
  key: string,
  draft: { subject?: string; bodyHtml?: string; wrapperLayoutId?: string | null },
  vars: Record<string, string> = {},
): Promise<RenderedEmail> {
  const def = getEmailTemplateDef(key)
  if (!def) throw new Error(`Unknown email template: ${key}`)
  const override = await getTemplateOverride(key)

  const sample: Record<string, string> = {}
  for (const tag of def.mergeTags) {
    if (vars[tag] !== undefined) {
      sample[tag] = vars[tag]
      continue
    }
    // Site-level tags are real, known values, so a preview shows the real ones.
    // Stamping "[siteName]" over the site's own name is how an admin comes to
    // believe the tag is broken and types the name in by hand instead - which
    // then survives every rename the site ever has.
    if (SITE_CONTEXT_TAGS.has(tag)) continue
    sample[tag] = sampleValueFor(tag)
  }

  return renderResolved({
    def,
    subjectTemplate: draft.subject ?? override?.subject ?? def.subject,
    bodyTemplate: draft.bodyHtml ?? override?.bodyHtml ?? def.bodyHtml,
    wrapperLayoutId: draft.wrapperLayoutId !== undefined ? draft.wrapperLayoutId : override?.wrapperLayoutId ?? null,
    vars: { ...sample, ...vars },
  })
}

/** Stand-in merge values for a preview. Recognisable as fake on sight, so
 * nobody mistakes a test for the real order confirmation. */
function sampleValueFor(tag: string): string {
  if (/url$/i.test(tag)) return 'https://example.com/sample-link'
  if (/email$/i.test(tag)) return 'sample@example.com'
  if (/code$/i.test(tag)) return '123456'
  if (/date|at$/i.test(tag)) return 'Monday, 1 January'
  if (/total|price|amount|subtotal/i.test(tag)) return '£00.00'
  return `[${tag}]`
}

export { escapeHtml, missingRequiredTags }
