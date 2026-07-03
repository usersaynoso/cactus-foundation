'use client'

import { usePathname } from 'next/navigation'
import { TabStrip } from '@/components/admin/TabStrip'
import type { MembersConfig } from '@/lib/members/config'

type SectionKey = 'profile' | 'security' | 'notifications' | 'activity' | 'dangerZone'

const SECTION_DEFS: Array<{ key: SectionKey; label: string; path: string }> = [
  { key: 'profile', label: 'Profile', path: '/profile' },
  { key: 'security', label: 'Security', path: '/security' },
  { key: 'notifications', label: 'Notifications', path: '/notifications' },
  { key: 'activity', label: 'Activity', path: '/activity' },
  { key: 'dangerZone', label: 'Danger Zone', path: '/danger-zone' },
]

type Props = {
  basePath: string
  sections: MembersConfig['accountSectionsEnabled']
}

export default function AccountNav({ basePath, sections }: Props) {
  const pathname = usePathname()

  const items = [
    { key: 'index', label: 'Overview', href: basePath, active: pathname === basePath },
    ...SECTION_DEFS.filter((s) => sections[s.key]).map((s) => ({
      key: s.key,
      label: s.label,
      href: `${basePath}${s.path}`,
      active: pathname === `${basePath}${s.path}`,
    })),
  ]

  return <TabStrip items={items} />
}
