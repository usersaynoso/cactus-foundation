import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'
import type { Metadata } from 'next'

// The Appearance screen is a client component, so its title has to live here.
// A layout cannot see ?tab=, so this names the section only.
export const metadata: Metadata = { title: 'Appearance — Admin' }

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function AppearanceSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['appearance.manage'], 'manage the site appearance')
  return denied ?? <>{children}</>
}
