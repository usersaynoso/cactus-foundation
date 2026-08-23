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

// Where a module's contribution slots in, both in the tab bar and in the
// one-page account: after Security, rather than appended to the lot. Appended,
// Shop's Orders came after Danger Zone - the tab a member actually uses sitting
// past the one about deleting their account, which reads as an afterthought.
export const ACCOUNT_SECTIONS_BEFORE_EXTRAS: AccountSectionKey[] = ['profile', 'security']

/** The sections actually on the page, in the order they appear. Shared so the
 *  tab bar and the one-page view cannot disagree about what is where. */
export function enabledAccountSectionKeys(
  sections: Record<AccountSectionKey, boolean>,
  notificationsAvailable: boolean,
): AccountSectionKey[] {
  return ACCOUNT_SECTION_DEFS.filter(
    (s) => sections[s.key] && (s.key !== 'notifications' || notificationsAvailable),
  ).map((s) => s.key)
}

/** Index in that list where module sections/tabs belong. -1 from findIndex means
 *  every enabled section belongs in front, so they go on the end. */
export function accountExtrasInsertIndex(keys: AccountSectionKey[]): number {
  const first = keys.findIndex((key) => !ACCOUNT_SECTIONS_BEFORE_EXTRAS.includes(key))
  return first === -1 ? keys.length : first
}

// A module tab's section on the one-page account. Namespaced away from the core
// anchors above so a module cannot land on `account-security` by naming its tab
// "security", and squeezed to what is safe in an id and a URL hash - a module
// picks its own tab keys and this is not the place to trust them.
export function moduleAccountSectionAnchor(navKey: string): string {
  const slug = navKey.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `account-x-${slug || 'section'}`
}
