// The member account's own sections, in the order they appear - shared by the
// tab bar, the overview page and the one-page view so the three can never
// disagree about what exists, what it is called, or where it lives.
//
// Deliberately free of server imports (no prisma, no next/server): the tab bar
// is a client component, and everything here has to survive being bundled.

export type AccountSectionKey = 'profile' | 'security' | 'notifications' | 'activity' | 'dangerZone'

export type AccountSectionDef = {
  key: AccountSectionKey
  label: string
  /** Its own page, under the member area root. */
  path: string
  /** Element id it gets in the one-page view, and the hash the tab points at. */
  anchor: string
}

export const ACCOUNT_SECTION_DEFS: AccountSectionDef[] = [
  { key: 'profile', label: 'Profile', path: '/profile', anchor: 'account-profile' },
  { key: 'security', label: 'Account & Security', path: '/security', anchor: 'account-security' },
  { key: 'notifications', label: 'Notifications', path: '/notifications', anchor: 'account-notifications' },
  { key: 'activity', label: 'Activity', path: '/activity', anchor: 'account-activity' },
  { key: 'dangerZone', label: 'Danger Zone', path: '/danger-zone', anchor: 'account-danger-zone' },
]

export function accountSectionAnchor(key: AccountSectionKey): string {
  return ACCOUNT_SECTION_DEFS.find((s) => s.key === key)?.anchor ?? ''
}
