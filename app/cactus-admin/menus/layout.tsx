import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function MenusSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['menus.manage'], 'manage navigation menus')
  return denied ?? <>{children}</>
}
