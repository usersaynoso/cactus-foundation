import { moduleSmsTemplates } from '@/lib/modules/sms-templates'

// The registry of every text message this site can send. Core sends none of
// its own - the one text core has always sent, the sign-in code, is assembled
// in lib/auth/sms.ts and must stay exactly as worded - so everything here comes
// from a module's manifest `smsTemplates` seam.
//
// Deliberately the same shape as lib/email/registry.ts, minus the two things a
// text has no room for: there is no subject and no wrapper design. A message is
// one short body, sent as typed.
//
// Keys are namespaced by the module that declared them (`shop.order-shipped`),
// and a module may only claim keys under its own name, which is what stops two
// modules quietly fighting over the same message.

export type SmsTemplateDef = {
  /** Namespaced, unique across the whole site. */
  key: string
  label: string
  body: string
  /** Offered as `{{tag}}` chips in the editor. */
  mergeTags: string[]
  /** Tags the message is useless without. An edit that drops one is rejected. */
  requiredTags?: string[]
  /** Transactional messages always send and cannot be switched off. */
  transactional: boolean
}

export type RegisteredSmsTemplate = SmsTemplateDef & {
  /** The module name that declared it. */
  source: string
  /** Heading this message sits under in the admin list. */
  groupLabel: string
}

// A single SMS segment is 160 GSM-7 characters, and 70 once anything outside
// that alphabet (a curly quote, an emoji) sneaks in. Nothing is truncated or
// refused at this length - a long message simply costs more to send - but the
// editor counts against it so an owner can see what they are signing up for.
export const SMS_SEGMENT_CHARS = 160
export const SMS_SEGMENT_CHARS_UNICODE = 70
/** Well past any sensible notification, and the point the editor stops saving. */
export const MAX_SMS_TEMPLATE_LENGTH = 1600

function buildRegistry(): Map<string, RegisteredSmsTemplate> {
  const map = new Map<string, RegisteredSmsTemplate>()
  for (const [moduleName, group] of Object.entries(moduleSmsTemplates)) {
    for (const t of group.templates) {
      if (!t.key.startsWith(`${moduleName}.`)) continue
      if (map.has(t.key)) continue
      map.set(t.key, { ...t, source: moduleName, groupLabel: group.groupLabel })
    }
  }
  return map
}

const REGISTRY = buildRegistry()

export function listSmsTemplates(): RegisteredSmsTemplate[] {
  return [...REGISTRY.values()]
}

export function getSmsTemplateDef(key: string): RegisteredSmsTemplate | null {
  return REGISTRY.get(key) ?? null
}

/** Rejects an edit that has dropped a merge tag the message cannot work
 * without. Returns the missing tags; empty means the edit is fine. */
export function missingRequiredSmsTags(def: RegisteredSmsTemplate, body: string): string[] {
  return (def.requiredTags ?? []).filter((tag) => !body.includes(`{{${tag}}}`))
}

export function isTransactionalSmsTemplate(key: string): boolean {
  return REGISTRY.get(key)?.transactional ?? true
}

/** Group order for the admin list: alphabetical by group label. Every message
 * belongs to a module, so there is no core-first case to special-case. */
export function groupSmsTemplates(templates: RegisteredSmsTemplate[]): Array<{ groupLabel: string; source: string; templates: RegisteredSmsTemplate[] }> {
  const groups = new Map<string, { groupLabel: string; source: string; templates: RegisteredSmsTemplate[] }>()
  for (const t of templates) {
    const groupKey = `${t.source}:${t.groupLabel}`
    let group = groups.get(groupKey)
    if (!group) {
      group = { groupLabel: t.groupLabel, source: t.source, templates: [] }
      groups.set(groupKey, group)
    }
    group.templates.push(t)
  }
  return [...groups.values()].sort((a, b) => a.groupLabel.localeCompare(b.groupLabel))
}

/** The text twin of emailOverrideValue - see lib/email/registry.ts for why a
 * stored copy identical to the default must not count as an override. */
export function smsOverrideValue(stored: string | null | undefined, defaultValue: string): string | null {
  if (stored === null || stored === undefined) return null
  // Trimmed compare: the editor's own validation trims what it posts, so a copy
  // that differs from the default by nothing but surrounding whitespace is not
  // an edit either.
  return stored.trim() === defaultValue.trim() ? null : stored
}
