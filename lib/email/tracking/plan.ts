import { EMAIL_CLICK_PATH, EMAIL_OPEN_PATH } from './paths'
import { instrumentEmailHtml } from './instrument'
import { signTrackingToken } from './token'

// ---------------------------------------------------------------------------
// Whether one outgoing message gets the site's own tracking, and if so, the
// tracked version of its body.
//
// The rules, in the order they are checked:
//
//   1. The caller said no (`tracking: false`). A module sending mailshots
//      through its own mail service says this, and so does anything else that
//      counts its own mail some other way.
//   2. It is not going out over SMTP. Brevo already counts opens and clicks on
//      everything it sends, and adding ours on top would count every open
//      twice - once by each - which is worse than either count on its own.
//   3. It is account-security mail: a sign-in code, a sign-in link, a recovery
//      link, a warning that an address changed. Never tracked, full stop. A
//      tracked sign-in link would be written into the database on the way past,
//      and a sign-in code is nobody's marketing metric.
//   4. The site has tracking switched off (Settings > Emails).
//   5. There is nothing to sign with (no SESSION_SECRET) or nowhere to point
//      the addresses (no SITE_URL). The message goes untracked rather than not
//      at all.
//   6. There is no HTML body. A plain-text message has nowhere to put a
//      picture, and rewriting the links in plain text would leave a reader
//      looking at a string of gibberish where the address should be.
// ---------------------------------------------------------------------------

/** What a caller of sendEmail may say about tracking. Left unset, the site's
 *  own rules decide. */
export type EmailTrackingRequest =
  | false
  | {
      /** The caller's own name for this message, handed back on every event
       *  about it (see lib/email/tracking/listeners.ts). */
      ref?: string
    }

/** Template keys whose mail is about getting into an account. */
const SECURITY_TEMPLATES = new Set([
  'member.magic-link',
  'member.verify-email',
  'member.email-change-code',
  'member.email-change-notice',
  'member.security-alert',
])

export function isAccountSecurityTemplate(key: string | null | undefined): boolean {
  const value = (key ?? '').trim().toLowerCase()
  if (!value) return false
  return value.startsWith('auth.') || SECURITY_TEMPLATES.has(value)
}

/** The template key a message carries in its headers, whatever case the header
 *  name was written in. */
function templateHeader(headers: Record<string, string> | undefined): string | null {
  const entry = Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === 'x-cactus-template')
  return entry?.[1] ?? null
}

export type TrackingDecisionInput = {
  tracking: EmailTrackingRequest | undefined
  transport: 'brevo' | 'smtp'
  templateKey?: string
  headers?: Record<string, string>
  html: string
  siteEnabled: boolean
  secret: string | null
  siteUrl: string | null
}

export function shouldTrackSend(input: TrackingDecisionInput): boolean {
  if (input.tracking === false) return false
  if (input.transport !== 'smtp') return false
  if (isAccountSecurityTemplate(input.templateKey) || isAccountSecurityTemplate(templateHeader(input.headers))) return false
  if (!input.siteEnabled) return false
  if (!input.secret || !input.siteUrl) return false
  if (!input.html.trim()) return false
  return true
}

/** Module names and refs travel inside the token, so only short, plain ones
 *  are accepted. Anything else is dropped rather than failing the send. */
function tokenSafe(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : undefined
}

/** The tracked body for one send. */
export function trackedHtml(input: {
  html: string
  emailLogId: string
  moduleName?: string
  ref?: string
  secret: string
  siteUrl: string
}): { html: string; links: number } {
  const base = input.siteUrl.replace(/\/+$/, '')
  const moduleName = tokenSafe(input.moduleName)
  const ref = tokenSafe(input.ref)
  const common = {
    e: input.emailLogId,
    ...(moduleName ? { m: moduleName } : {}),
    ...(ref ? { x: ref } : {}),
  }
  const openToken = signTrackingToken({ k: 'o', ...common }, input.secret)
  return instrumentEmailHtml(input.html, {
    openUrl: `${base}${EMAIL_OPEN_PATH}${openToken}`,
    linkUrl: (destination) => {
      try {
        return `${base}${EMAIL_CLICK_PATH}${signTrackingToken({ k: 'c', ...common, u: destination }, input.secret)}`
      } catch {
        // A destination the token will not carry. The link goes untracked.
        return null
      }
    },
  })
}
