import { resolveBranding } from '@/lib/config/branding'
import { prisma } from '@/lib/db/prisma'
import { buildAdminThemeStyles, buildFontHref } from '@/lib/design/tokens'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const [branding, config] = await Promise.all([
    resolveBranding(),
    prisma.siteConfig.findUnique({ where: { id: 'singleton' }, select: { designTokens: true } }),
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
