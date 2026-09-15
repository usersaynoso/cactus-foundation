import { getInstalledModules } from '@/lib/modules/live-status'
import { MODULES_IN_BUILD } from '@/lib/modules/router'
import { hasPermissions } from '@/lib/permissions/check'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { SessionUser } from '@/lib/auth/session'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

/**
 * Invisible client services that should keep running on every admin screen -
 * mail collection, campaign ticks, and anything else a module registers under
 * `core.admin-background-services`. Rendered once in the admin shell so they
 * do not unmount when somebody leaves the screen that used to host them.
 */
export default async function AdminBackgroundServices({ user }: { user: SessionUser }) {
  const modules = await getInstalledModules().catch(() => [])
  const liveModules = modules.filter((mod) => MODULES_IN_BUILD.has(mod.name))

  const entries: ExtensionPointEntry[] = []
  for (const mod of liveModules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point === 'core.admin-background-services') entries.push(entry)
    }
  }

  if (entries.length === 0) return null

  const permissionKeys = [
    ...new Set(entries.map((e) => e.permission).filter((p): p is string => !!p)),
  ]
  const permissions = permissionKeys.length > 0
    ? await hasPermissions(user, permissionKeys).catch(() => ({} as Record<string, boolean>))
    : {}

  const components = moduleExtensionPointComponents['core.admin-background-services'] ?? {}
  const visible = entries.filter((e) => !e.permission || permissions[e.permission] === true)

  return (
    <>
      {visible.map((entry) => {
        const Service = components[entry.id]
        return Service ? <Service key={entry.id} /> : null
      })}
    </>
  )
}
