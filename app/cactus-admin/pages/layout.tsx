import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function PagesSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['pages.read', 'pages.write', 'pages.publish', 'pages.delete'], 'manage info pages')
  return denied ?? <>{children}</>
}
