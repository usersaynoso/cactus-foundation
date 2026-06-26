import { prisma } from '@/lib/db/prisma'
import { Render } from '@puckeditor/core/rsc'
import { footerPuckRscConfig } from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
import AosInit from '@/lib/puck/components/AosInit'
import SiteHeader from '@/components/public/SiteHeader'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { getSessionFromCookie } from '@/lib/auth/session'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        adminPath: true,
        logoMediaId: true,
        footerBuilderData: true,
        designTokens: true,
      },
    })
    .catch(() => null)

  const logoMedia = config?.logoMediaId
    ? await prisma.media.findUnique({ where: { id: config.logoMediaId }, select: { url: true } }).catch(() => null)
    : null

  const user = await getSessionFromCookie().catch(() => null)
  const isLoggedIn = !!user

  const ctx = {
    siteName: config?.siteName ?? '',
    logoUrl: logoMedia?.url ?? null,
    isLoggedIn,
    adminPath: config?.adminPath ?? '',
  }

  const footerData = config?.footerBuilderData
    ? await resolveTemplateData(config.footerBuilderData, ctx).catch(() => null)
    : null

  // Build CSS variables from design tokens
  const tokens = (config?.designTokens ?? {}) as Record<string, string>
  const cssVars = [
    tokens.primaryColor   ? `--color-primary: ${tokens.primaryColor};` : '',
    tokens.primaryFg      ? `--color-primary-fg: ${tokens.primaryFg};` : '',
    tokens.bgColor        ? `--color-bg: ${tokens.bgColor};` : '',
    tokens.fgColor        ? `--color-fg: ${tokens.fgColor};` : '',
    tokens.mutedColor     ? `--color-muted: ${tokens.mutedColor};` : '',
    tokens.borderColor    ? `--color-border: ${tokens.borderColor};` : '',
    tokens.fontHeading    ? `--font-heading: ${tokens.fontHeading};` : '',
    tokens.fontBody       ? `--font-body: ${tokens.fontBody};` : '',
    tokens.borderRadius   ? `--border-radius: ${tokens.borderRadius};` : '',
    tokens.linkColor      ? `--color-link: ${tokens.linkColor};` : '',
    tokens.linkHoverColor ? `--color-link-hover: ${tokens.linkHoverColor};` : '',
    tokens.h1Size         ? `--h1-size: ${tokens.h1Size};` : '',
    tokens.h2Size         ? `--h2-size: ${tokens.h2Size};` : '',
    tokens.h3Size         ? `--h3-size: ${tokens.h3Size};` : '',
    tokens.bodySize       ? `--body-size: ${tokens.bodySize};` : '',
    tokens.bodyLineHeight ? `--body-line-height: ${tokens.bodyLineHeight};` : '',
    tokens.containerMaxWidth ? `--container-max-width: ${tokens.containerMaxWidth};` : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      {cssVars && (
        <style dangerouslySetInnerHTML={{ __html: `:root { ${cssVars} }` }} />
      )}
      <AosInit />
      <SiteHeader />
      <main>{children}</main>
      {footerData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={footerPuckRscConfig as any} data={footerData as Data} />
        : null
      }
    </>
  )
}
