import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'
import type { Metadata } from 'next'

// The screen is a client component, so its title has to live here.
export const metadata: Metadata = { title: 'Modules — Admin' }

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function ModulesSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['modules.manage'], 'manage modules')
  return denied ?? <>{children}</>
}
