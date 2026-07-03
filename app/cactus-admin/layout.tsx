import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import AdminShell from '@/components/admin/AdminShell'
import { getUnreadCount } from '@/lib/notifications/deployment'
import { buildAdminThemeStyles, buildFontHref } from '@/lib/design/tokens'
import pkg from '@/package.json'
import type { Metadata } from 'next'

type NavEntry = { label: string; path: string; icon?: string; permission?: string }
type NavGroup = { label: string | null; links: Array<{ label: string; path: string; icon?: string }> }

// Members system (MEMBERS_SPEC.md) - a core feature, not a module, but its
// sidebar section is permission-filtered the same way module navEntries are
// (existing core sections like Content/People/System are not - see
// FIELD_NOTES.md Admin UI section for why this is a deliberate departure).
const MEMBERS_NAV_ENTRIES: Array<{ label: string; path: string; permission: string }> = [
  { label: 'Overview', path: '/members', permission: 'members.list' },
  { label: 'Members', path: '/members/list', permission: 'members.list' },
  { label: 'Pending approval', path: '/members/pending-approval', permission: 'members.approve' },
  { label: 'Invites', path: '/members/invites', permission: 'members.invite' },
  { label: 'Email templates', path: '/members/email-templates', permission: 'members.email-templates' },
  { label: 'GDPR', path: '/members/gdpr', permission: 'members.gdpr' },
  { label: 'Settings', path: '/members/settings', permission: 'members.settings' },
]

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

  const [config, activeModules, unreadCount] = await Promise.all([
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { siteName: true, designTokens: true } }),
    prisma.module.findMany({ where: { status: { in: ['active', 'update_available'] } }, select: { manifest: true } }),
    getUnreadCount(),
  ])

  // Most modules share one flat "Modules" bucket in the sidebar; a module can opt
  // into its own labelled section (e.g. "Gazette") by setting navGroupLabel.
  const ungroupedLinks: NavGroup['links'] = []
  const labelledGroups = new Map<string, NavGroup['links']>()
  for (const mod of activeModules) {
    const manifest = mod.manifest as { navEntries?: NavEntry[]; navGroupLabel?: string } | null
    if (!manifest?.navEntries) continue
    const links: NavGroup['links'] = []
    for (const entry of manifest.navEntries) {
      if (!entry.permission || await hasPermission(user, entry.permission)) {
        links.push({ label: entry.label, path: entry.path, icon: entry.icon })
      }
    }
    if (links.length === 0) continue
    if (manifest.navGroupLabel) {
      labelledGroups.set(manifest.navGroupLabel, [...(labelledGroups.get(manifest.navGroupLabel) ?? []), ...links])
    } else {
      ungroupedLinks.push(...links)
    }
  }
  const moduleNavGroups: NavGroup[] = []
  if (ungroupedLinks.length > 0) moduleNavGroups.push({ label: null, links: ungroupedLinks })
  for (const [label, links] of labelledGroups) moduleNavGroups.push({ label, links })

  const membersLinks: Array<{ path: string; label: string }> = []
  for (const entry of MEMBERS_NAV_ENTRIES) {
    if (await hasPermission(user, entry.permission)) {
      membersLinks.push({ path: entry.path, label: entry.label })
    }
  }

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
        membersLinks={membersLinks}
        unreadCount={unreadCount}
      >
        {children}
      </AdminShell>
    </>
  )
}
