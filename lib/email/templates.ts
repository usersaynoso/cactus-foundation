import { sendEmail } from '@/lib/email/index'

// Admin-editable email templates for the Members system (MEMBERS_SPEC.md
// Email section). Code defaults live here; an admin override is a row in the
// EmailTemplate table keyed by `key` - absence of a row means "use the
// default", and resetting to default is just deleting that row.
//
// Transactional (marked here) templates always send and are never subject to
// MemberNotificationPreference - they're account-lifecycle/security
// necessities, not a subscription a member can opt out of.

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

type TemplateDefault = {
  label: string
  subject: string
  bodyHtml: string
  mergeTags: string[]
  transactional: boolean
}

export const MEMBER_EMAIL_TEMPLATES: Record<MemberEmailTemplateKey, TemplateDefault> = {
  'member.verify-email': {
    label: 'Verify email address',
    subject: 'Verify your {{siteName}} account',
    bodyHtml: '<p>Thanks for registering. Confirm your email address to finish setting up your account:</p><p><a href="{{verifyUrl}}">{{verifyUrl}}</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>',
    mergeTags: ['siteName', 'verifyUrl'],
    transactional: true,
  },
  'member.welcome': {
    label: 'Welcome',
    subject: 'Welcome to {{siteName}}',
    bodyHtml: '<p>Hi {{username}}, welcome to {{siteName}} - your account is ready to use.</p>',
    mergeTags: ['siteName', 'username'],
    transactional: false,
  },
  'member.magic-link': {
    label: 'Magic sign-in link',
    subject: 'Your {{siteName}} sign-in link',
    bodyHtml: '<p>Use the link below to sign in:</p><p><a href="{{magicUrl}}">{{magicUrl}}</a></p><p>This link expires in 15 minutes and can only be used once. If you did not request this, you can ignore this email.</p>',
    mergeTags: ['siteName', 'magicUrl'],
    transactional: true,
  },
  'member.suspended': {
    label: 'Account suspended',
    subject: 'Your {{siteName}} account has been suspended',
    bodyHtml: '<p>Your account has been suspended.{{reasonLine}}</p>',
    mergeTags: ['siteName', 'reasonLine'],
    transactional: false,
  },
  'member.deletion-requested': {
    label: 'Deletion requested',
    subject: 'Your {{siteName}} account is scheduled for deletion',
    bodyHtml: '<p>Your account is scheduled for deletion on {{scheduledAt}}. You can cancel this any time before then from your account.</p>',
    mergeTags: ['siteName', 'scheduledAt'],
    transactional: true,
  },
  'member.deletion-cancelled': {
    label: 'Deletion cancelled',
    subject: 'Your {{siteName}} account deletion was cancelled',
    bodyHtml: '<p>Your account deletion request has been cancelled. Your account remains active.</p>',
    mergeTags: ['siteName'],
    transactional: true,
  },
  'member.deletion-admin-notify': {
    label: 'Admin: deletion requested',
    subject: '{{siteName}}: member account scheduled for deletion',
    bodyHtml: '<p><strong>{{username}}</strong> has requested account deletion.</p>',
    mergeTags: ['siteName', 'username'],
    transactional: true,
  },
  'member.approved': {
    label: 'Registration approved',
    subject: '{{siteName}}: your account has been approved',
    bodyHtml: '<p>Your account has been approved. You can now sign in.</p>',
    mergeTags: ['siteName'],
    transactional: false,
  },
  'member.digest-daily': {
    label: 'Daily digest',
    subject: 'Your {{siteName}} daily digest',
    bodyHtml: '<p>{{digestBody}}</p>',
    mergeTags: ['siteName', 'digestBody'],
    transactional: false,
  },
  'member.digest-weekly': {
    label: 'Weekly digest',
    subject: 'Your {{siteName}} weekly digest',
    bodyHtml: '<p>{{digestBody}}</p>',
    mergeTags: ['siteName', 'digestBody'],
    transactional: false,
  },
  'member.security-alert': {
    label: 'Security alert',
    subject: '{{siteName}}: security alert on your account',
    bodyHtml: '<p>{{alertBody}}</p>',
    mergeTags: ['siteName', 'alertBody'],
    transactional: true,
  },
}

export function listMemberEmailTemplateKeys(): MemberEmailTemplateKey[] {
  return Object.keys(MEMBER_EMAIL_TEMPLATES) as MemberEmailTemplateKey[]
}

export function isTransactionalTemplate(key: MemberEmailTemplateKey): boolean {
  return MEMBER_EMAIL_TEMPLATES[key].transactional
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function interpolate(template: string, vars: Record<string, string>, escape: boolean): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined) return ''
    return escape ? escapeHtml(value) : value
  })
}

export type RenderedEmail = { subject: string; html: string; text: string }

// DB override else code default; {{tag}} interpolation, HTML-escaped in the
// body (merge values may include user-supplied text like a suspension
// reason), plain in the subject (a mail header, not markup).
export async function renderEmailTemplate(
  key: MemberEmailTemplateKey,
  vars: Record<string, string>
): Promise<RenderedEmail> {
  const { prisma } = await import('@/lib/db/prisma')
  const override = await prisma.emailTemplate.findUnique({ where: { key } })
  const def = MEMBER_EMAIL_TEMPLATES[key]

  const subjectTemplate = override?.subject ?? def.subject
  const bodyTemplate = override?.bodyHtml ?? def.bodyHtml
  // Text alternative: strip tags from the template first, then interpolate
  // unescaped - stripping the already-escaped HTML would leave literal
  // "&amp;" etc. in the plain-text version.
  const bodyTextTemplate = bodyTemplate.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  return {
    subject: interpolate(subjectTemplate, vars, false),
    html: interpolate(bodyTemplate, vars, true),
    text: interpolate(bodyTextTemplate, vars, false),
  }
}

// Sends a rendered member.* template to a member's own address. Non-
// transactional templates check MemberNotificationPreference only when the
// caller supplies a matching `category` - core ships no non-transactional
// categories of its own yet (see Phase 3), so this is currently a no-op gate
// unless/until a module-driven call passes one.
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

  const { subject, html, text } = await renderEmailTemplate(key, vars)
  await sendEmail({ to: member.email, subject, html, text })
}
