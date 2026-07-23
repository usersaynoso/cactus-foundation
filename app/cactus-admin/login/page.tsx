import { resolveBranding } from '@/lib/config/branding'
import { prisma } from '@/lib/db/prisma'
import { buildAdminThemeStyles, buildFontHref } from '@/lib/design/tokens'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  // Both reads are best-effort. This is the page every locked-out session lands on,
  // including the one SessionExpiryWatcher sends an idle tab to after 24 hours - i.e.
  // often the first request a cold instance serves. Losing the site's colours is a
  // cosmetic disappointment; a 500 in place of the sign-in form is a locked door, so
  // neither query is allowed to take the page down. resolveBranding already defends
  // itself the same way.
  const [branding, config] = await Promise.all([
    resolveBranding(),
    prisma.siteConfig
      .findUnique({ where: { id: 'singleton' }, select: { designTokens: true } })
      .catch(() => null),
  ])

  // Login page is excluded from AdminLayout's shell (see app/cactus-admin/layout.tsx),
  // so it must inject the same site-brand theme itself to match the rest of admin.
  const adminThemeStyles = buildAdminThemeStyles(config?.designTokens)
  const fontHref = buildFontHref(config?.designTokens)

  return (
    <>
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      {adminThemeStyles && <style dangerouslySetInnerHTML={{ __html: adminThemeStyles }} />}
      <LoginForm
        siteName={branding.name}
        faviconUrl={branding.faviconUrl}
        faviconDarkUrl={branding.faviconDarkUrl}
      />
    </>
  )
}
