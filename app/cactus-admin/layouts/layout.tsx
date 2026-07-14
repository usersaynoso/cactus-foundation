import { getInstalledModuleLayoutGroups } from '@/lib/layout/installed-layout-types'
import { ModuleLayoutGroupsProvider } from '@/components/admin/ModuleLayoutGroupsContext'

// The Layouts screens are client components, so they cannot ask the database which
// modules this site has installed - and the generated list they used to import is
// build-time only, hence Shop tabs on sites with no Shop. Resolved once here and
// shared by the list, the picker and the editor.
export default async function LayoutsSectionLayout({ children }: { children: React.ReactNode }) {
  const groups = await getInstalledModuleLayoutGroups()
  return <ModuleLayoutGroupsProvider value={groups}>{children}</ModuleLayoutGroupsProvider>
}
