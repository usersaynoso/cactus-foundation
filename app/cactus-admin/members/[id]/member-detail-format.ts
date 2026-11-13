// Display helpers for the member detail screen. Plain functions, no React, so
// they are cheap to test and shared by every panel on the screen.

import type { MemberStatusValue } from './member-detail-types'

export const STATUS_PRESENTATION: Record<MemberStatusValue, { label: string; badge: string; hint: string }> = {
  ACTIVE: { label: 'Active', badge: 'badge-green', hint: 'Can sign in and use the site.' },
  PENDING_VERIFICATION: { label: 'Awaiting email check', badge: 'badge-yellow', hint: 'Has not clicked the link in their verification email yet.' },
  PENDING_APPROVAL: { label: 'Awaiting approval', badge: 'badge-yellow', hint: 'Verified, waiting for an admin to let them in.' },
  SUSPENDED: { label: 'Suspended', badge: 'badge-red', hint: 'Cannot sign in until unsuspended.' },
  DELETED: { label: 'Deleted', badge: 'badge-gray', hint: 'Account closed.' },
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function formatDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '-'
}

export function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '-'
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]
const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })

/** "3 days ago", "yesterday", "just now". `now` is passed in so a render is repeatable. */
export function formatRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Never'
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

/** "Chrome on macOS" out of a user-agent string, or the raw string's head when nothing matches. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device'
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux'
    : null
  if (browser && os) return `${browser} on ${os}`
  if (browser || os) return (browser ?? os) as string
  return ua.length > 60 ? `${ua.slice(0, 57)}...` : ua
}

const ACTION_LABELS: Record<string, string> = {
  edit_profile: 'Edited profile',
  suspend: 'Suspended',
  unsuspend: 'Unsuspended',
  approve: 'Approved',
  reject: 'Rejected',
  trust: 'Marked trusted',
  untrust: 'Removed trusted flag',
  verify_email: 'Marked email as verified',
  revoke_session: 'Signed out a device',
  revoke_all_sessions: 'Signed out everywhere',
  reset_password: 'Reset password and two-step',
  export_trigger: 'Requested a data export',
  set_marketing_consent: 'Changed their marketing answer',
}

/** Log actions as a person would say them. Unknown keys (a module's own) fall back to their words. */
export function describeAction(action: string): string {
  const known = ACTION_LABELS[action]
  if (known) return known
  // The bulk screen logs the same actions with a prefix; say which it was.
  if (action.startsWith('bulk_')) return `${describeAction(action.slice(5))} (in bulk)`
  const words = action.replace(/[_.-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const TWO_FACTOR_LABELS: Record<'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS', string> = {
  EMAIL: 'Email code',
  AUTHENTICATOR_APP: 'Authenticator app',
  SMS: 'Text message',
}

/** The name to call the member by: the one they chose (where the site asks), then their real one, then the handle. */
export function memberName(
  member: { displayName: string | null; fullName: string | null; username: string },
  displayNamesOn = true,
): string {
  // A site that does not ask for display names may still hold old ones; the
  // name the member gave at checkout or on their account is the one to use.
  return (displayNamesOn ? member.displayName : null) || member.fullName || member.username
}
