import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import {
  moduleLayoutTypeGroups,
  moduleLayoutTypeToGroup,
  type ModuleLayoutTypeGroup,
} from '@/lib/layout/module-layout-types'
import { isKnownLayoutType } from '@/lib/layout/layout-type-tabs'

// Which module layout types *exist* is a build fact: generate-module-layout-types.mjs
// scans /modules, and every build clones every module listed in modules.json. Whether
// this site has one *installed* is a database fact. They are not the same thing, and
// everything the owner sees has to go by the second - a site with no Shop was being
// shown Shop tabs and a pile of Shop starter templates purely because the build had
// the module's code lying around. This is the gate the admin sidebar already applies
// to nav entries (app/cactus-admin/layout.tsx); layouts now use it too.

export async function getInstalledModuleNames(): Promise<Set<string>> {
  const rows = await prisma.module.findMany({
    where: INSTALLED_MODULE_WHERE,
    select: { name: true },
  })
  return new Set(rows.map((r) => r.name))
}

/** The module layout-type groups this site may actually offer: declared by a
 * module in the build AND installed here.
 *
 * Filtered type by type rather than group by group, because a group is not always
 * one module's - an add-on can host its types under another module's tab
 * (layoutTypes.host), so the Shop tab on a site with the Quotes add-on carries two
 * more sub-tabs than the same tab without it. Each type answers for its own module;
 * a group left with nothing drops out entirely. */
export async function getInstalledModuleLayoutGroups(): Promise<ModuleLayoutTypeGroup[]> {
  const installed = await getInstalledModuleNames()
  return moduleLayoutTypeGroups
    .map((g) => ({ ...g, types: g.types.filter((t) => installed.has(t.moduleName)) }))
    .filter((g) => g.types.length > 0)
}

/** Server-side twin of isKnownLayoutType: a core type, or a module type whose
 * module is installed here. Stops a shopProduct layout being written into a site
 * that has no Shop - the tabs are the polite gate, this is the real one. */
export async function isInstalledLayoutType(type: unknown): Promise<boolean> {
  if (!isKnownLayoutType(type)) return false
  const group = moduleLayoutTypeToGroup[type]
  if (!group) return true // a core type
  return (await getInstalledModuleNames()).has(group.moduleName)
}
