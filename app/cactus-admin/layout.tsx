import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermissions, isAdmin } from '@/lib/permissions/check'
import { buildModuleNavGroups, CORE_NAV_PERMISSION_KEYS, parseAdminMenuConfig, resolveAdminMenu, type ModuleManifestNav } from '@/lib/nav/admin-menu'
import { prisma } from '@/lib/db/prisma'
import AdminShell from '@/components/admin/AdminShell'
import { getUnreadCount } from '@/lib/notifications/deployment'
import { buildAdminThemeStyles, buildFontHref } from '@/lib/design/tokens'
import { sanitizeSvg } from '@/lib/sanitize'
import { resolveBranding } from '@/lib/config/branding'
import pkg from '@/package.json'
import type { Metadata } from 'next'

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
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true, designTokens: true, adminMenuConfig: true } }),
    prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } }),
    getUnreadCount(),
    resolveBranding(),
  ])

  const manifests = activeModules.map((mod) => mod.manifest as ModuleManifestNav | null)
  // Module nav-entry permissions AND the core items' default-visibility keys are
  // resolved together in one batch: the same map gates module links and drives the
  // core sidebar resolution below. One query instead of one round-trip per entry.
  const navPermissionKeys = [
    ...new Set([
      ...manifests.flatMap((m) => (m?.navEntries ?? []).map((e) => e.permission).filter((p): p is string => !!p)),
      ...CORE_NAV_PERMISSION_KEYS,
    ]),
  ]
  const navPermissions = await hasPermissions(user, navPermissionKeys)

  // Group module links exactly as the sidebar always has (see buildModuleNavGroups).
  // Icons are inline SVG markup injected with dangerouslySetInnerHTML, so each is
  // scrubbed here in the server component - AdminNav is a client component with no
  // access to the jsdom-backed sanitiser.
  const moduleNavGroups = buildModuleNavGroups(manifests, {
    canSee: (permission) => !permission || navPermissions[permission] === true,
    sanitizeIcon: sanitizeSvg,
  })

  // Resolve the sidebar for this user: apply the site owner's saved customisation
  // (order/rename/visibility from Settings > Navigation) and filter to what this
  // role may see. isProtected admins see every item so they can never hide the
  // screen that edits these rules from themselves.
  const menuSections = resolveAdminMenu(moduleNavGroups, parseAdminMenuConfig(config?.adminMenuConfig), {
    roleId: user.role.id,
    isAdmin: isAdmin(user),
    can: (key) => navPermissions[key] === true,
  })

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
        siteName={config?.siteName ?? 'Cactus Foundation'}
        version={pkg.version}
        sections={menuSections}
        unreadCount={unreadCount}
        faviconUrl={branding.faviconUrl}
        faviconDarkUrl={branding.faviconDarkUrl}
      >
        {children}
      </AdminShell>
    </>
  )
}
