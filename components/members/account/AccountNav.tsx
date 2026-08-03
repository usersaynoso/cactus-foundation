'use client'

import { usePathname } from 'next/navigation'
import { TabStrip } from '@/components/admin/TabStrip'
import type { MembersConfig } from '@/lib/members/config'
import type { MemberAccountNavItem } from '@/lib/members/account-nav'

type SectionKey = 'profile' | 'security' | 'notifications' | 'activity' | 'dangerZone'

const SECTION_DEFS: Array<{ key: SectionKey; label: string; path: string }> = [
  { key: 'profile', label: 'Profile', path: '/profile' },
  { key: 'security', label: 'Security', path: '/security' },
  { key: 'notifications', label: 'Notifications', path: '/notifications' },
  { key: 'activity', label: 'Activity', path: '/activity' },
  { key: 'dangerZone', label: 'Danger Zone', path: '/danger-zone' },
]

// Module tabs (Shop contributes Orders and Addresses) slot in after Security
// rather than being appended to the lot. Appended, they came after Danger Zone
// - the two tabs a member actually uses sitting past the one about deleting
// their account, which reads as an afterthought.
const SECTIONS_BEFORE_EXTRAS: SectionKey[] = ['profile', 'security']

type Props = {
  basePath: string
  sections: MembersConfig['accountSectionsEnabled']
  /** Tabs contributed by modules via `members.account-nav`. */
  extras?: MemberAccountNavItem[]
  /** False when no module contributes notification categories, which hides the
   * Notifications tab: core has none of its own, so the page would only ever
   * say there is nothing to choose. */
  notificationsAvailable?: boolean
}

// Overview is the only tab matched exactly: its href is a prefix of every other
// tab's, so a prefix match would light it up everywhere. The rest match their
// own sub-tree, or a module's detail page (/shop/account/orders/<id>) would
// leave every tab unlit and the member looking at an orphan page.
function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AccountNav({ basePath, sections, extras = [], notificationsAvailable = true }: Props) {
  const pathname = usePathname()

  const sectionItems = SECTION_DEFS.filter(
    (s) => sections[s.key] && (s.key !== 'notifications' || notificationsAvailable),
  ).map((s) => ({
    key: s.key,
    label: s.label,
    href: `${basePath}${s.path}`,
    active: isActive(pathname, `${basePath}${s.path}`, false),
  }))

  // Where the module tabs go. findIndex, not a fixed count: any of the sections
  // can be switched off in settings, so the first tab that is not a
  // before-extras one is the seam wherever it lands (and -1 means every enabled
  // section belongs in front, so they go on the end).
  const firstAfter = sectionItems.findIndex((item) => !SECTIONS_BEFORE_EXTRAS.includes(item.key))
  const insertAt = firstAfter === -1 ? sectionItems.length : firstAfter

  const items = [
    { key: 'index', label: 'Overview', href: basePath, active: isActive(pathname, basePath, true) },
    ...sectionItems.slice(0, insertAt),
    ...extras.map((extra) => ({
      // Namespaced so a module cannot collide with a built-in section key.
      key: `x:${extra.key}`,
      // .badge/.badge-primary rather than inline colours: it is the house pill
      // and it is already the right way round in dark mode, where white on
      // --color-primary only reaches 3.6:1.
      label: extra.badge ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
          {extra.label}
          <span className="badge badge-primary">{extra.badge}</span>
        </span>
      ) : (
        extra.label
      ),
      href: extra.href,
      active: isActive(pathname, extra.href, false),
    })),
    ...sectionItems.slice(insertAt),
  ]

  return <TabStrip items={items} />
}
