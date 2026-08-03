import { sendEmail } from '@/lib/email/index'
import { getEmailTemplateDef, isTransactionalTemplate } from '@/lib/email/registry'
import { renderEmailTemplate, type RenderedEmail } from '@/lib/email/render'

// The Members half of the email registry. Defaults and rendering both moved to
// lib/email/registry.ts and lib/email/render.ts when every email on the site -
// core, auth and module - was brought under one editor; what stays here is the
// members-specific sending rule that has no business in the generic renderer:
// the notification-preference gate.

export type MemberEmailTemplateKey =
  | 'member.verify-email'
  | 'member.welcome'
  | 'member.magic-link'
  | 'member.suspended'
  | 'member.deletion-requested'
  | 'member.deletion-cancelled'
  | 'member.deletion-admin-notify'
  | 'member.approved'
  | 'member.digest-daily'
  | 'member.digest-weekly'
  | 'member.security-alert'

export type { RenderedEmail }

export function listMemberEmailTemplateKeys(): MemberEmailTemplateKey[] {
  return [
    'member.verify-email',
    'member.welcome',
    'member.magic-link',
    'member.suspended',
    'member.deletion-requested',
    'member.deletion-cancelled',
    'member.deletion-admin-notify',
    'member.approved',
    'member.digest-daily',
    'member.digest-weekly',
    'member.security-alert',
  ]
}

export { isTransactionalTemplate }

/** Renders a member template, or null when the admin has switched it off. Thin
 * pass-through, kept so members code has one import for the whole subject. */
export async function renderMemberEmail(
  key: MemberEmailTemplateKey,
  vars: Record<string, string>
): Promise<RenderedEmail | null> {
  if (!getEmailTemplateDef(key)) throw new Error(`Unknown email template: ${key}`)
  return renderEmailTemplate(key, vars)
}

// Sends a rendered member.* template to a member's own address. Non-
// transactional templates check MemberNotificationPreference only when the
// caller supplies a matching `category` - core ships no non-transactional
// categories of its own yet, so this is currently a no-op gate unless/until a
// module-driven call passes one. The admin's own on/off switch is applied
// separately, inside renderEmailTemplate.
export async function sendMemberEmail(
  member: { email: string },
  key: MemberEmailTemplateKey,
  vars: Record<string, string>,
  opts?: { category?: string; memberId?: string }
): Promise<void> {
  const transactional = isTransactionalTemplate(key)
  if (!transactional && opts?.category && opts.memberId) {
    const { prisma } = await import('@/lib/db/prisma')
    const pref = await prisma.memberNotificationPreference.findUnique({
      where: { memberId_channel_category: { memberId: opts.memberId, channel: 'EMAIL', category: opts.category } },
    })
    if (pref && !pref.enabled) return
  }

  const rendered = await renderEmailTemplate(key, vars)
  if (!rendered) return
  await sendEmail({ to: member.email, subject: rendered.subject, html: rendered.html, text: rendered.text })
}
