import type { ReactNode } from 'react'
import { getInstalledModuleLayoutGroups } from '@/lib/layout/installed-layout-types'
import { ModuleLayoutGroupsProvider } from '@/components/admin/ModuleLayoutGroupsContext'
import { denyUnlessAny } from '@/lib/permissions/section-gate'
import type { Metadata } from 'next'

// The list screen is a client component, so its title has to live here. Nested
// segments (the editor, /new) override it with their own.
export const metadata: Metadata = { title: 'Layouts — Admin' }

// Two jobs, both of which have to happen above the screens themselves.
//
// The gate covers this screen and everything nested under it, the editor included
// (see lib/permissions/section-gate).
//
// The Layouts screens are client components, so they cannot ask the database which
// modules this site has installed - and the generated list they used to import is
// build-time only, hence Shop tabs on sites with no Shop. Resolved once here and
// shared by the list, the picker and the editor.
export default async function LayoutsSectionLayout({ children }: { children: ReactNode }) {
  const denied = await denyUnlessAny(['layouts.manage'], 'manage layouts')
  if (denied) return denied
  const groups = await getInstalledModuleLayoutGroups()
  return <ModuleLayoutGroupsProvider value={groups}>{children}</ModuleLayoutGroupsProvider>
}
