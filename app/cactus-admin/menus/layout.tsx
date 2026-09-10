import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'
import type { Metadata } from 'next'

// The list screen is a client component, so its title has to live here. The
// editor segment overrides it with the menu's own name.
export const metadata: Metadata = { title: 'Menus — Admin' }

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function MenusSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['menus.manage'], 'manage navigation menus')
  return denied ?? <>{children}</>
}
