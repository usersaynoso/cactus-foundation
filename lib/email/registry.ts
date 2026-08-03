import { moduleEmailTemplates } from '@/lib/modules/email-templates'

// The single registry of every email this site can send: core's own, plus
// whatever the installed modules declare through their manifest `emailTemplates`
// seam. Code defaults live here (or in a module's own defaults file); an admin
// edit is a row in the EmailTemplate table keyed by the same `key`, so "reset to
// default" is just nulling the override columns back out.
//
// Keys are namespaced by source - `member.*` / `auth.*` / `system.*` for core,
// `<module-name>.*` for a module. The generator enforces the module prefix at
// build time, so two modules can never collide on a key.
//
// Transactional templates always send and can never be switched off: they are
// account-lifecycle and security necessities, not a subscription. Non-
// transactional ones get an on/off toggle in the admin.

export type EmailTemplateDef = {
  /** Namespaced, unique across the whole site. */
  key: string
  label: string
  subject: string
  bodyHtml: string
  /** Offered as `{{tag}}` chips in the editor. */
  mergeTags: string[]
  /**
   * Merge tags the email is useless without - a login code, a verification
   * link. Saving an edit that has dropped one is rejected, which is the only
   * thing standing between a well-meaning admin and an unusable sign-in email.
   */
  requiredTags?: string[]
  /**
   * Merge tags whose value is markup the sending code assembled itself - an
   * order's item table, a quote's line rows. They go into the body unescaped;
   * every other tag is escaped, because merge values routinely carry text
   * somebody typed into a form. Only list a tag here if its value is built in
   * code, with its own escaping, and never passed straight through from input.
   */
  rawTags?: string[]
  transactional: boolean
}

export type RegisteredEmailTemplate = EmailTemplateDef & {
  /** 'core', or the module name that declared it. */
  source: string
  /** Heading this template sits under in the admin list. */
  groupLabel: string
}

type CoreTemplate = EmailTemplateDef & { groupLabel: string }

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const MEMBER_TEMPLATES: CoreTemplate[] = [
  {
    key: 'member.verify-email',
    groupLabel: 'Members',
    label: 'Verify email address',
    subject: 'Verify your {{siteName}} account',
    bodyHtml: '<p>Thanks for registering. Confirm your email address to finish setting up your account:</p><p><a href="{{verifyUrl}}">{{verifyUrl}}</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this email.</p>',
    mergeTags: ['siteName', 'verifyUrl'],
    requiredTags: ['verifyUrl'],
    transactional: true,
  },
  {
    key: 'member.welcome',
    groupLabel: 'Members',
    label: 'Welcome',
    subject: 'Welcome to {{siteName}}',
    bodyHtml: '<p>Hi {{username}}, welcome to {{siteName}} - your account is ready to use.</p>',
    mergeTags: ['siteName', 'username'],
    transactional: false,
  },
  {
    // Sent to the address the account is being moved TO. Until this code comes
    // back the member keeps their current address, so a typo costs nothing.
    key: 'member.email-change-code',
    groupLabel: 'Members',
    label: 'Confirm new email address',
    subject: 'Confirm your new {{siteName}} email address',
    bodyHtml: '<p>Your confirmation code is: <strong>{{code}}</strong></p><p>Enter it on your account page to finish moving your {{siteName}} sign-in to this address.</p><p>This code expires in 10 minutes. If you were not expecting this, you can ignore it - nothing has changed yet.</p>',
    mergeTags: ['siteName', 'code'],
    requiredTags: ['code'],
    transactional: true,
  },
  {
    // Sent to the address the account is moving AWAY from, so a member whose
    // session has been taken finds out while they can still do something.
    key: 'member.email-change-notice',
    groupLabel: 'Members',
    label: 'Email address change requested',
    subject: 'Someone asked to change your {{siteName}} email address',
    bodyHtml: '<p>A request was made to move your {{siteName}} sign-in to <strong>{{newEmail}}</strong>.</p><p>It will not take effect until that address is confirmed.</p><p>If this was not you, sign in and change your password now - whoever asked for this has access to your account.</p>',
    mergeTags: ['siteName', 'newEmail'],
    transactional: true,
  },
  {
    key: 'member.magic-link',
    groupLabel: 'Members',
    label: 'Magic sign-in link',
    subject: 'Your {{siteName}} sign-in link',
    bodyHtml: '<p>Use the link below to sign in:</p><p><a href="{{magicUrl}}">{{magicUrl}}</a></p><p>This link expires in 15 minutes and can only be used once. If you did not request this, you can ignore this email.</p>',
    mergeTags: ['siteName', 'magicUrl'],
    requiredTags: ['magicUrl'],
    transactional: true,
  },
  {
    key: 'member.suspended',
    groupLabel: 'Members',
    label: 'Account suspended',
    subject: 'Your {{siteName}} account has been suspended',
    bodyHtml: '<p>Your account has been suspended.{{reasonLine}}</p>',
    mergeTags: ['siteName', 'reasonLine'],
    transactional: false,
  },
  {
    key: 'member.deletion-requested',
    groupLabel: 'Members',
    label: 'Deletion requested',
    subject: 'Your {{siteName}} account is scheduled for deletion',
    bodyHtml: '<p>Your account is scheduled for deletion on {{scheduledAt}}. You can cancel this any time before then from your account.</p>',
    mergeTags: ['siteName', 'scheduledAt'],
    transactional: true,
  },
  {
    key: 'member.deletion-cancelled',
    groupLabel: 'Members',
    label: 'Deletion cancelled',
    subject: 'Your {{siteName}} account deletion was cancelled',
    bodyHtml: '<p>Your account deletion request has been cancelled. Your account remains active.</p>',
    mergeTags: ['siteName'],
    transactional: true,
  },
  {
    key: 'member.deletion-admin-notify',
    groupLabel: 'Members',
    label: 'Admin: deletion requested',
    subject: '{{siteName}}: member account scheduled for deletion',
    bodyHtml: '<p><strong>{{username}}</strong> has requested account deletion.</p>',
    mergeTags: ['siteName', 'username'],
    transactional: true,
  },
  {
    key: 'member.pending-approval-admin-notify',
    groupLabel: 'Members',
    label: 'Admin: member awaiting approval',
    subject: '{{siteName}}: new member awaiting approval',
    bodyHtml: '<p><strong>{{username}}</strong> has registered and is awaiting approval.</p>',
    mergeTags: ['siteName', 'username'],
    transactional: true,
  },
  {
    key: 'member.approved',
    groupLabel: 'Members',
    label: 'Registration approved',
    subject: '{{siteName}}: your account has been approved',
    bodyHtml: '<p>Your account has been approved. You can now sign in.</p>',
    mergeTags: ['siteName'],
    transactional: false,
  },
  {
    key: 'member.digest-daily',
    groupLabel: 'Members',
    label: 'Daily digest',
    subject: 'Your {{siteName}} daily digest',
    bodyHtml: '<p>{{digestBody}}</p>',
    mergeTags: ['siteName', 'digestBody'],
    transactional: false,
  },
  {
    key: 'member.digest-weekly',
    groupLabel: 'Members',
    label: 'Weekly digest',
    subject: 'Your {{siteName}} weekly digest',
    bodyHtml: '<p>{{digestBody}}</p>',
    mergeTags: ['siteName', 'digestBody'],
    transactional: false,
  },
  {
    key: 'member.security-alert',
    groupLabel: 'Members',
    label: 'Security alert',
    subject: '{{siteName}}: security alert on your account',
    bodyHtml: '<p>{{alertBody}}</p>',
    mergeTags: ['siteName', 'alertBody'],
    transactional: true,
  },
]

// ---------------------------------------------------------------------------
// Account and security (admin/staff sign-in, previously hardcoded in
// lib/email/index.ts). Every one of these is transactional, and the ones that
// carry a code or a link declare it as required so an edit can't strip it.
// ---------------------------------------------------------------------------

const AUTH_TEMPLATES: CoreTemplate[] = [
  {
    key: 'auth.login-code',
    groupLabel: 'Account and security',
    label: 'Login code',
    subject: 'Your {{siteName}} login code: {{code}}',
    bodyHtml: '<p>Your one-time login code is: <strong>{{code}}</strong></p><p>This code expires in 10 minutes.</p>',
    mergeTags: ['siteName', 'code'],
    requiredTags: ['code'],
    transactional: true,
  },
  {
    key: 'auth.verify-email',
    groupLabel: 'Account and security',
    label: 'Verify email address',
    subject: 'Verify your {{siteName}} email address',
    bodyHtml: '<p>Your email verification code is: <strong>{{code}}</strong></p><p>This code expires in 10 minutes.</p>',
    mergeTags: ['siteName', 'code'],
    requiredTags: ['code'],
    transactional: true,
  },
  {
    key: 'auth.email-change-code',
    groupLabel: 'Account and security',
    label: 'Confirm new email address',
    subject: 'Confirm your new {{siteName}} email address',
    bodyHtml: '<p>Your confirmation code is: <strong>{{code}}</strong></p><p>Enter it on the account page to finish moving your {{siteName}} sign-in to this address.</p><p>This code expires in 10 minutes. If you were not expecting this, you can ignore it - nothing has changed yet.</p>',
    mergeTags: ['siteName', 'code'],
    requiredTags: ['code'],
    transactional: true,
  },
  {
    key: 'auth.email-change-notice',
    groupLabel: 'Account and security',
    label: 'Email address change requested',
    subject: 'Someone asked to change your {{siteName}} email address',
    bodyHtml: '<p>A request was made to move your {{siteName}} sign-in to <strong>{{newEmail}}</strong>.</p><p>It will not take effect until that address is confirmed.</p><p>If this was not you, sign in and change your password now - whoever asked for this has access to your account.</p>',
    mergeTags: ['siteName', 'newEmail'],
    transactional: true,
  },
  {
    key: 'auth.recovery-link',
    groupLabel: 'Account and security',
    label: 'Account recovery link',
    subject: '{{siteName}} account recovery',
    bodyHtml: '<p>You requested account recovery. Use the link below to regain access:</p><p><a href="{{recoveryUrl}}">{{recoveryUrl}}</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>',
    mergeTags: ['siteName', 'recoveryUrl'],
    requiredTags: ['recoveryUrl'],
    transactional: true,
  },
  {
    key: 'auth.recovery-requested',
    groupLabel: 'Account and security',
    label: 'Account recovery requested',
    subject: '{{siteName}} account recovery requested',
    bodyHtml: '<p>A recovery link was just requested for your account. If this was not you, you can safely ignore this email - no changes have been made.</p>',
    mergeTags: ['siteName'],
    transactional: true,
  },
  {
    key: 'auth.recovery-completed',
    groupLabel: 'Account and security',
    label: 'Account recovery completed',
    subject: '{{siteName}} account recovery completed',
    bodyHtml: '<p>A recovery action was just completed on your account. If this was not you, please contact support immediately.</p>',
    mergeTags: ['siteName'],
    transactional: true,
  },
  {
    key: 'auth.password-changed',
    groupLabel: 'Account and security',
    label: 'Password changed',
    subject: '{{siteName}} password changed',
    bodyHtml: '<p>The password on your account was just added or changed. If this was you, no further action is needed.</p><p>If this was not you, please secure your account and contact support straight away.</p>',
    mergeTags: ['siteName'],
    transactional: true,
  },
]

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

const SYSTEM_TEMPLATES: CoreTemplate[] = [
  {
    key: 'system.test-email',
    groupLabel: 'System',
    label: 'Test email',
    subject: '{{siteName}} test email',
    bodyHtml: '<p>This is a test email from your {{siteName}} admin settings. If you received this, outgoing email is working.</p>',
    mergeTags: ['siteName'],
    transactional: true,
  },
]

export const CORE_EMAIL_TEMPLATES: CoreTemplate[] = [
  ...MEMBER_TEMPLATES,
  ...AUTH_TEMPLATES,
  ...SYSTEM_TEMPLATES,
]

// ---------------------------------------------------------------------------
// Merged view
// ---------------------------------------------------------------------------

/**
 * Every email opens with its own subject as a heading, so the message reads as
 * a titled thing rather than starting mid-sentence under the logo. Done here
 * rather than typed into each default so it also covers the templates modules
 * declare, and so the heading tracks the subject instead of drifting from it.
 *
 * It lands in the default body, which means it shows up in the editor as
 * ordinary copy: an admin can reword it, move it, or delete it per email, and
 * "put the original wording back" brings it back.
 */
function withSubjectHeading<T extends EmailTemplateDef>(t: T): T {
  return { ...t, bodyHtml: `<h3>${t.subject}</h3>\n${t.bodyHtml}` }
}

function buildRegistry(): Map<string, RegisteredEmailTemplate> {
  const map = new Map<string, RegisteredEmailTemplate>()
  for (const t of CORE_EMAIL_TEMPLATES) {
    map.set(t.key, withSubjectHeading({ ...t, source: 'core' }))
  }
  for (const [moduleName, group] of Object.entries(moduleEmailTemplates)) {
    for (const t of group.templates) {
      // Two rules, both there to stop one module quietly taking over an email
      // another module (or core) still sends: a module may only claim keys
      // under its own name, and first registration wins.
      if (!t.key.startsWith(`${moduleName}.`)) continue
      if (map.has(t.key)) continue
      map.set(t.key, withSubjectHeading({ ...t, source: moduleName, groupLabel: group.groupLabel }))
    }
  }
  return map
}

const REGISTRY = buildRegistry()

export function listEmailTemplates(): RegisteredEmailTemplate[] {
  return [...REGISTRY.values()]
}

export function getEmailTemplateDef(key: string): RegisteredEmailTemplate | null {
  return REGISTRY.get(key) ?? null
}

/** Rejects an edit that has dropped a merge tag the email cannot work without.
 * Returns the missing tags; empty means the edit is fine. */
export function missingRequiredTags(def: RegisteredEmailTemplate, subject: string, bodyHtml: string): string[] {
  const haystack = `${subject}\n${bodyHtml}`
  return (def.requiredTags ?? []).filter((tag) => !haystack.includes(`{{${tag}}}`))
}

export function isTransactionalTemplate(key: string): boolean {
  return REGISTRY.get(key)?.transactional ?? true
}

/** Group order for the admin list: core first, in declaration order, then
 * modules alphabetically by group label. */
export function groupEmailTemplates(templates: RegisteredEmailTemplate[]): Array<{ groupLabel: string; source: string; templates: RegisteredEmailTemplate[] }> {
  const groups = new Map<string, { groupLabel: string; source: string; templates: RegisteredEmailTemplate[] }>()
  for (const t of templates) {
    const groupKey = `${t.source}:${t.groupLabel}`
    let group = groups.get(groupKey)
    if (!group) {
      group = { groupLabel: t.groupLabel, source: t.source, templates: [] }
      groups.set(groupKey, group)
    }
    group.templates.push(t)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.source === 'core' && b.source !== 'core') return -1
    if (b.source === 'core' && a.source !== 'core') return 1
    if (a.source === 'core' && b.source === 'core') return 0
    return a.groupLabel.localeCompare(b.groupLabel)
  })
}
