import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { Render } from '@puckeditor/core/rsc'
import { headerPuckRscConfig, footerPuckRscConfig } from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
import AosInit from '@/lib/puck/components/AosInit'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        adminPath: true,
        logoMediaId: true,
        headerBuilderData: true,
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

  // Inject resolved runtime values into Puck builder data so SiteLogo,
  // LoginButton etc. render correctly server-side without needing hooks.
  function injectCtx(data: unknown): Data | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Data
    return {
      ...d,
      content: (d.content ?? []).map((block: any) => {
        if (block.type === 'SiteLogo') return { ...block, props: { ...block.props, siteName: config?.siteName, logoUrl: logoMedia?.url ?? '' } }
        if (block.type === 'LoginButton') return { ...block, props: { ...block.props, isLoggedIn, adminPath: config?.adminPath ?? '' } }
        if (block.type === 'MenuBlock') return { ...block, props: { ...block.props, siteName: config?.siteName } }
        return block
      }),
    }
  }

  const headerData = injectCtx(config?.headerBuilderData)
  const footerData = injectCtx(config?.footerBuilderData)

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
      {headerData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={headerPuckRscConfig as any} data={headerData} />
        : null
      }
      <main>{children}</main>
      {footerData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={footerPuckRscConfig as any} data={footerData} />
        : null
      }
    </>
  )
}
