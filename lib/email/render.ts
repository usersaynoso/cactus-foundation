import { prisma } from '@/lib/db/prisma'
import { getEmailTemplateDef, missingRequiredTags, type RegisteredEmailTemplate } from '@/lib/email/registry'
import { escapeHtml, interpolate } from '@/lib/email/blocks'
import { getEmailPalette, resolveEmailWrapper, wrapEmailHtml } from '@/lib/email/wrapper'

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

function absolutise(url: string | null | undefined, siteUrl: string): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${siteUrl.replace(/\/$/, '')}${url}`
  return url
}

export async function getSiteEmailContext(): Promise<SiteEmailContext> {
  const config = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { siteName: true, logoMediaId: true } })
    .catch(() => null)
  const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '')
  const logo = config?.logoMediaId
    ? await prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
    : null
  return {
    siteName: config?.siteName ?? 'Cactus Foundation',
    siteUrl,
    logoUrl: absolutise(logo?.url, siteUrl),
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
  // Text alternative comes off the *body* only - a plain-text reader wants the
  // message, not a flattened rendering of the header, footer and social row.
  // Strip tags before interpolating so already-escaped entities don't leak in.
  const bodyTextTemplate = bodyWithConditionals.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

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
    html: wrapEmailHtml({ bodyHtml: body, subject, vars: merged, palette, layout }),
    text: interpolate(bodyTextTemplate, merged, false),
  }
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
  for (const tag of def.mergeTags) sample[tag] = vars[tag] ?? sampleValueFor(tag)

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
