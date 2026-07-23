import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionWithMeta, msUntilExpiry } from '@/lib/auth/session'
import { hasPermissions, isAdmin } from '@/lib/permissions/check'
import { buildModuleNavGroups, CORE_NAV_PERMISSION_KEYS, parseAdminMenuConfig, resolveAdminMenu, type ModuleManifestNav } from '@/lib/nav/admin-menu'
import { getInstalledModules } from '@/lib/modules/live-status'
import { MODULES_IN_BUILD } from '@/lib/modules/router'
import AdminShell from '@/components/admin/AdminShell'
import { getUnreadCount } from '@/lib/notifications/deployment'
import { buildAdminThemeStyles, buildFontHref } from '@/lib/design/tokens'
import { sanitizeSvg } from '@/lib/sanitize'
import { resolveBranding } from '@/lib/config/branding'
import { getSiteConfig } from '@/lib/config/site'
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
  // Same cached lookup getSessionFromCookie uses, so asking for the expiry as
  // well costs no extra query - it feeds SessionExpiryWatcher in the shell.
  //
  // A throw here (a passing DB blip on a cold instance) would bubble past this
  // segment's error.tsx to the root, i.e. a bare 500 - and this is the admin shell,
  // the frame every admin page renders inside. proxy.ts has already validated the
  // session as the primary gate, so treating a failed secondary read as "not signed
  // in" and bouncing to the now-resilient login page is a safe degradation: it never
  // fabricates a session, and the worst case is one re-authentication instead of a
  // dead screen. Kept outside the redirect (redirect() throws NEXT_REDIRECT).
  let session: Awaited<ReturnType<typeof getSessionWithMeta>>
  try {
    session = await getSessionWithMeta()
  } catch {
    session = null
  }
  if (!session) {
    redirect(`/${adminPath}/login`)
  }
  const user = session.user

  // Every read below is best-effort for the same reason: a blip on any one must
  // degrade a corner of the shell, never take the whole frame down. Each falls back
  // to the same empty/absent value the layout already tolerates - config is read
  // through `?.`, an empty module list just drops module nav, zero unread hides the
  // badge. resolveBranding already self-guards (returns the Cactus defaults).
  const [config, activeModules, unreadCount, branding] = await Promise.all([
    getSiteConfig().catch(() => null),
    // Installed here AND present in this build. Unlike the extension-point call sites,
    // nav entries come straight off the stored manifest with no generated registry to
    // drop a module whose code has not landed yet - so a first install would advertise
    // links that 404 until its deploy finishes. MODULES_IN_BUILD is that missing half.
    getInstalledModules().catch(() => []),
    getUnreadCount().catch(() => 0),
    resolveBranding(),
  ])

  const liveModules = activeModules.filter((mod) => MODULES_IN_BUILD.has(mod.name))
  const manifests = liveModules.map((mod) => mod.manifest as ModuleManifestNav | null)
  // Module settings tabs (shown inside Settings, not the sidebar) so the command
  // palette can search them - resolved from the same manifests, gated by each tab's
  // own permission in the same batch query below.
  // `host` marks a settings panel rendered inside another module's slot rather than
  // as its own top-level Settings tab, so it isn't a /config?tab= destination.
  type ModuleSettingsTabMeta = { id: string; label: string; permission?: string; host?: string }
  const settingsTabManifests = liveModules.map((mod) => mod.manifest as { settingsTabs?: ModuleSettingsTabMeta[] } | null)
  // Module nav-entry permissions, each module settings tab's permission, AND the core
  // items' default-visibility keys are resolved together in one batch: the same map
  // gates module links, module settings tabs, and the core sidebar resolution below.
  const navPermissionKeys = [
    ...new Set([
      ...manifests.flatMap((m) => (m?.navEntries ?? []).map((e) => e.permission).filter((p): p is string => !!p)),
      ...settingsTabManifests.flatMap((m) => (m?.settingsTabs ?? []).map((t) => t.permission).filter((p): p is string => !!p)),
      ...CORE_NAV_PERMISSION_KEYS,
    ]),
  ]
  // Same best-effort stance: on a failed read, fall back to "grant nothing". That
  // can only ever hide nav a role was entitled to (a self-correcting annoyance),
  // never reveal one it wasn't. isProtected admins take the no-DB all-true branch
  // inside hasPermissions, so the catch only bites non-admins and only ever denies.
  const navPermissions = await hasPermissions(user, navPermissionKeys).catch(
    () => ({}) as Record<string, boolean>,
  )

  // The module settings tabs this user may open, as command-palette search targets.
  const moduleSettingsTabs: Array<{ id: string; label: string }> = []
  for (const m of settingsTabManifests) {
    for (const t of m?.settingsTabs ?? []) {
      if (t.host) continue // hosted panel, not a top-level tab - nothing to deep-link to
      if (!t.permission || navPermissions[t.permission] === true) {
        moduleSettingsTabs.push({ id: t.id, label: t.label })
      }
    }
  }

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
        moduleSettingsTabs={moduleSettingsTabs}
        unreadCount={unreadCount}
        faviconUrl={branding.faviconUrl}
        faviconDarkUrl={branding.faviconDarkUrl}
        sessionExpiresInMs={msUntilExpiry(session.expiresAt)}
      >
        {children}
      </AdminShell>
    </>
  )
}
