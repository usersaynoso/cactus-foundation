import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function AppearanceSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['appearance.manage'], 'manage the site appearance')
  return denied ?? <>{children}</>
}
