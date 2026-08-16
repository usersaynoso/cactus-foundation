import { prisma } from '@/lib/db/prisma'
import { interpolate } from '@/lib/email/blocks'
import { applyConditionals } from '@/lib/email/render'
import {
  getSmsTemplateDef,
  missingRequiredSmsTags,
  SMS_SEGMENT_CHARS,
  SMS_SEGMENT_CHARS_UNICODE,
  type RegisteredSmsTemplate,
} from '@/lib/sms/registry'

// Renders one registered text message: code default, overlaid with the admin's
// edit if there is one, then interpolated. No wrapper, no HTML, no escaping -
// a text message is plain text, and escaping an ampersand into `&amp;` is the
// one thing that would make it worse.
//
// Sending lives in lib/sms/send.ts, the same way lib/email/render.ts leaves
// transport to lib/email/index.ts.

export type SmsSiteContext = { siteName: string; siteUrl: string }

/** Filled in from the site record on every render, whoever the caller is. */
const SITE_CONTEXT_TAGS: ReadonlySet<string> = new Set(['siteName', 'siteUrl'])

export async function getSmsSiteContext(): Promise<SmsSiteContext> {
  const config = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { siteName: true } })
    .catch(() => null)
  return {
    siteName: config?.siteName ?? 'Cactus Foundation',
    siteUrl: (process.env.SITE_URL ?? '').replace(/\/$/, ''),
  }
}

export type SmsTemplateOverride = { body: string | null; isActive: boolean }

export async function getSmsTemplateOverride(key: string): Promise<SmsTemplateOverride | null> {
  const row = await prisma.smsTemplate
    .findUnique({ where: { key }, select: { body: true, isActive: true } })
    .catch(() => null)
  return row ?? null
}

async function renderResolved(bodyTemplate: string, vars: Record<string, string>): Promise<string> {
  const site = await getSmsSiteContext()
  // Caller-supplied values win, matching the email renderer: a module that
  // passes its own shop name must not be second-guessed by the site record.
  const merged: Record<string, string> = { siteName: site.siteName, siteUrl: site.siteUrl, ...vars }
  return interpolate(applyConditionals(bodyTemplate, merged), merged, false)
    // A template edited in a textarea picks up trailing blank lines nobody
    // meant to pay for, and a text message is billed by the character.
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Null means "this message is switched off" - the admin has untoggled a
 * non-transactional template, and the caller should quietly not send. An
 * unknown key is a programming error and throws, because the alternative is a
 * message that silently stops going out after a rename.
 */
export async function renderSmsTemplate(key: string, vars: Record<string, string> = {}): Promise<string | null> {
  const def = getSmsTemplateDef(key)
  if (!def) throw new Error(`Unknown SMS template: ${key}`)

  const override = await getSmsTemplateOverride(key)
  if (override && !override.isActive && !def.transactional) return null

  return renderResolved(override?.body ?? def.body, vars)
}

/** Same path as a real send, but with unsaved editor content and sample merge
 * values - what the admin's preview and test-send both go through. */
export async function previewSmsTemplate(
  key: string,
  draft: { body?: string },
  vars: Record<string, string> = {},
): Promise<string> {
  const def = getSmsTemplateDef(key)
  if (!def) throw new Error(`Unknown SMS template: ${key}`)
  const override = await getSmsTemplateOverride(key)

  const sample: Record<string, string> = {}
  for (const tag of def.mergeTags) {
    if (vars[tag] !== undefined) {
      sample[tag] = vars[tag]
      continue
    }
    // Site-level tags are real, known values, so a preview shows the real ones -
    // same reasoning as the email preview.
    if (SITE_CONTEXT_TAGS.has(tag)) continue
    sample[tag] = sampleValueFor(tag)
  }

  return renderResolved(draft.body ?? override?.body ?? def.body, { ...sample, ...vars })
}

/** Stand-in merge values for a preview. Recognisable as fake on sight. */
function sampleValueFor(tag: string): string {
  if (/url$/i.test(tag)) return 'https://example.com/x'
  if (/number$/i.test(tag)) return 'AB000123'
  if (/name$/i.test(tag)) return 'Sam'
  if (/date|at$/i.test(tag)) return 'Monday, 1 January'
  if (/total|price|amount/i.test(tag)) return '£00.00'
  return `[${tag}]`
}

/** Segments the message would cost to send, and which alphabet decided it.
 * Anything outside GSM-7 drops the whole message to 70 characters a segment,
 * which is worth showing an owner before they paste in a curly quote. */
export function smsSegments(body: string): { chars: number; segments: number; unicode: boolean } {
  // The GSM-7 basic set plus its extension table, near enough: everything a
  // British shop actually types. Anything else forces UCS-2.
  const unicode = /[^\r\n @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]/.test(body)
  const perSegment = unicode ? SMS_SEGMENT_CHARS_UNICODE : SMS_SEGMENT_CHARS
  const chars = body.length
  // Concatenated messages spend header room, so a two-part message is 153 (or
  // 67) characters a part rather than the single-message length.
  const perConcatenated = unicode ? 67 : 153
  const segments = chars === 0 ? 0 : chars <= perSegment ? 1 : Math.ceil(chars / perConcatenated)
  return { chars, segments, unicode }
}

export { missingRequiredSmsTags }
export type { RegisteredSmsTemplate }
