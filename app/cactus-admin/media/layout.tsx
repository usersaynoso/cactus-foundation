import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'

// Covers this screen and everything nested under it. See lib/permissions/section-gate.
export default async function MediaSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['media.upload', 'media.delete'], 'manage media')
  return denied ?? <>{children}</>
}
