import type { ReactNode } from 'react'
import { denyUnlessAny } from '@/lib/permissions/section-gate'

// The generator writes a privacy policy page and points the site's consent
// settings at it, so it wants the same key as the rest of Settings. It gets its
// own gate rather than one on /config, because Settings itself is reachable by a
// role that only holds a module settings tab's permission.
export default async function PrivacyGeneratorLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['config.manage'], 'use the privacy policy generator')
  return denied ?? <>{children}</>
}
