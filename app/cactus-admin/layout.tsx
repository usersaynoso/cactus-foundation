import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import AdminShell from '@/components/admin/AdminShell'
import { getUnreadCount } from '@/lib/notifications/deployment'
import { buildAdminThemeStyles, buildFontHref } from '@/lib/design/tokens'
import { sanitizeSvg } from '@/lib/sanitize'
import { resolveBranding } from '@/lib/config/branding'
import pkg from '@/package.json'
import type { Metadata } from 'next'

type NavEntry = { label: string; path: string; icon?: string; permission?: string }
type NavGroup = { label: string | null; links: Array<{ label: string; path: string; icon?: string }> }

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

  const [config, activeModules, unreadCount, branding] = await Promise.all([
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true, designTokens: true } }),
    prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } }),
    getUnreadCount(),
    resolveBranding(),
  ])

  // Every permission guarding a module nav entry is resolved in a single batch
  // query. Checking them one at a time inside the loop below meant one database
  // round-trip per entry, on every admin page load.
  const manifests = activeModules.map(
    (mod) => mod.manifest as { navEntries?: NavEntry[]; navGroupLabel?: string; navGroupOrder?: number } | null
  )
  const navPermissionKeys = [
    ...new Set(
      manifests.flatMap((m) => (m?.navEntries ?? []).map((e) => e.permission).filter((p): p is string => !!p))
    ),
  ]
  const navPermissions = await hasPermissions(user, navPermissionKeys)

  // Most modules share one flat "Modules" bucket in the sidebar; a module can opt
  // into its own labelled section (e.g. "Gazette") by setting navGroupLabel. Sections
  // sort by navGroupOrder (lowest first, unset sorts last) so a module can request a
  // spot near the top of the module list without core hardcoding any module's name.
  const ungroupedLinks: NavGroup['links'] = []
  const labelledGroups = new Map<string, NavGroup['links']>()
  const labelledGroupOrder = new Map<string, number>()
  for (const manifest of manifests) {
    if (!manifest?.navEntries) continue
    const links: NavGroup['links'] = []
    for (const entry of manifest.navEntries) {
      if (!entry.permission || navPermissions[entry.permission]) {
        // A manifest icon is inline SVG markup, and AdminNav injects it with
        // dangerouslySetInnerHTML - so a module author (or a tampered module
        // repo) could otherwise ship a <script> that runs on every admin page.
        // Scrubbed here, in the server component, because AdminNav is a client
        // component and can't reach the jsdom-backed sanitiser.
        links.push({
          label: entry.label,
          path: entry.path,
          icon: entry.icon ? sanitizeSvg(entry.icon) : undefined,
        })
      }
    }
    if (links.length === 0) continue
    if (manifest.navGroupLabel) {
      labelledGroups.set(manifest.navGroupLabel, [...(labelledGroups.get(manifest.navGroupLabel) ?? []), ...links])
      const order = manifest.navGroupOrder ?? Infinity
      const existingOrder = labelledGroupOrder.get(manifest.navGroupLabel)
      if (existingOrder === undefined || order < existingOrder) labelledGroupOrder.set(manifest.navGroupLabel, order)
    } else {
      ungroupedLinks.push(...links)
    }
  }
  const moduleNavGroups: NavGroup[] = []
  if (ungroupedLinks.length > 0) moduleNavGroups.push({ label: null, links: ungroupedLinks })
  const sortedLabels = [...labelledGroups.keys()].sort((a, b) => (labelledGroupOrder.get(a) ?? Infinity) - (labelledGroupOrder.get(b) ?? Infinity))
  for (const label of sortedLabels) moduleNavGroups.push({ label, links: labelledGroups.get(label)! })

  // White-label the admin chrome to the site's primary colour and font. Only the
  // --color-primary family and --font-sans are injected (see buildAdminThemeStyles)
  // so admin spacing, radii and the mono/code font stay on the Cactus design system.
  const adminThemeStyles = buildAdminThemeStyles(config?.designTokens)
  // Load the site font(s) so the adopted --font-sans actually renders in admin.
  const fontHref = buildFontHref(config?.designTokens)

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      {adminThemeStyles && <style dangerouslySetInnerHTML={{ __html: adminThemeStyles }} />}
      <AdminShell
        adminPath={adminPath}
        userRole={user.role}
        siteName={config?.siteName ?? 'Cactus Foundation'}
        version={pkg.version}
        moduleNavGroups={moduleNavGroups}
        unreadCount={unreadCount}
        faviconUrl={branding.faviconUrl}
        faviconDarkUrl={branding.faviconDarkUrl}
      >
        {children}
      </AdminShell>
    </>
  )
}
