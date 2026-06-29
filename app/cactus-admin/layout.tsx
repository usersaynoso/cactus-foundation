import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import AdminShell from '@/components/admin/AdminShell'
import pkg from '@/package.json'
import type { Metadata } from 'next'

type NavEntry = { label: string; path: string; icon?: string; permission?: string }

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const adminPath = headersList.get('x-cactus-admin-path') ?? ''

  // Login page bypasses auth — render it without the admin shell to avoid
  // an infinite redirect loop (layout redirecting to login, which is itself).
  const isLoginPage = headersList.get('x-cactus-is-login') === '1'
  if (isLoginPage) {
    return <>{children}</>
  }

  // Secondary session check — proxy.ts is the primary gate, but server components
  // independently validate so a bypass of proxy.ts headers never opens the UI.
  const user = await getSessionFromCookie()
  if (!user) {
    redirect(`/${adminPath}/login`)
  }

  const [config, activeModules] = await Promise.all([
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true } }),
    prisma.module.findMany({ where: { status: 'active' }, select: { manifest: true } }),
  ])

  const moduleNavEntries: Array<{ label: string; path: string; icon?: string }> = []
  for (const mod of activeModules) {
    const manifest = mod.manifest as { navEntries?: NavEntry[] } | null
    if (!manifest?.navEntries) continue
    for (const entry of manifest.navEntries) {
      if (!entry.permission || await hasPermission(user, entry.permission)) {
        moduleNavEntries.push({ label: entry.label, path: entry.path, icon: entry.icon })
      }
    }
  }

  return (
    <AdminShell adminPath={adminPath} userRole={user.role} siteName={config?.siteName ?? 'Cactus Foundation'} version={pkg.version} moduleNavEntries={moduleNavEntries}>
      {children}
    </AdminShell>
  )
}
