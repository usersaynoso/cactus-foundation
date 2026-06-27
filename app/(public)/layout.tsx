import { prisma } from '@/lib/db/prisma'
import { Render } from '@puckeditor/core/rsc'
import { headerPuckRscConfig, footerPuckRscConfig } from '@/lib/puck/config'
import type { Data } from '@puckeditor/core'
import AosInit from '@/lib/puck/components/AosInit'
import { resolveTemplateData } from '@/lib/puck/resolveTemplateData'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getSessionFromCookie } from '@/lib/auth/session'

type ColourSlot = { name: string; hex: string; darkHex?: string }
type DesignTokens = {
  colours?: ColourSlot[]
  typography?: { fontHeading?: string; fontBody?: string; h1Size?: string; h2Size?: string; h3Size?: string; bodySize?: string; bodyLineHeight?: string }
  spacing?: { base?: number }
  radius?: { small?: string; medium?: string; large?: string }
  shadows?: { subtle?: string; elevated?: string }
}

function buildTokenStyles(tokens: DesignTokens): string {
  const colours = tokens.colours ?? []
  const lightColours = colours.map((c, i) => `--color-${i + 1}: ${c.hex};`).join(' ')
  const darkColours = colours.map((c, i) => `--color-${i + 1}: ${c.darkHex ?? c.hex};`).join(' ')

  const t = tokens.typography ?? {}
  const typography = [
    t.fontHeading ? `--font-heading: ${t.fontHeading};` : '',
    t.fontBody ? `--font-body: ${t.fontBody};` : '',
    t.h1Size ? `--h1-size: ${t.h1Size};` : '',
    t.h2Size ? `--h2-size: ${t.h2Size};` : '',
    t.h3Size ? `--h3-size: ${t.h3Size};` : '',
    t.bodySize ? `--body-size: ${t.bodySize};` : '',
    t.bodyLineHeight ? `--body-line-height: ${t.bodyLineHeight};` : '',
  ].filter(Boolean).join(' ')

  const sp = tokens.spacing?.base ?? 4
  const spacingSteps = [1, 2, 3, 4, 6, 8, 12, 16, 24]
  const spacing = spacingSteps.map((m, i) => `--sp-${i + 1}: ${sp * m}px;`).join(' ')

  const r = tokens.radius ?? {}
  const radius = [
    `--radius-sm: ${r.small ?? '2px'};`,
    `--radius-md: ${r.medium ?? '6px'};`,
    `--radius-lg: ${r.large ?? '9999px'};`,
  ].join(' ')

  const s = tokens.shadows ?? {}
  const shadows = [
    `--shadow-subtle: ${s.subtle ?? '0 2px 8px rgba(0,0,0,0.08)'};`,
    `--shadow-elevated: ${s.elevated ?? '0 4px 24px rgba(0,0,0,0.15)'};`,
  ].join(' ')

  const shared = [typography, spacing, radius, shadows].filter(Boolean).join(' ')

  return [
    `:root,[data-theme="light"]{${lightColours}${shared}}`,
    `[data-theme="dark"]{${darkColours}}`,
    `@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){${darkColours}}}`,
  ].join('\n')
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        adminPath: true,
        logoMediaId: true,
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

  const [headerLayout, footerLayout] = await Promise.all([
    resolveThemeLayout('header', {}),
    resolveThemeLayout('footer', {}),
  ])

  const headerData = headerLayout?.builderData
    ? await resolveTemplateData(headerLayout.builderData, ctx).catch(() => null)
    : null

  const footerData = footerLayout?.builderData
    ? await resolveTemplateData(footerLayout.builderData, ctx).catch(() => null)
    : null

  const tokens = (config?.designTokens ?? {}) as DesignTokens
  const cssStyles = buildTokenStyles(tokens)

  return (
    <>
      {cssStyles && <style dangerouslySetInnerHTML={{ __html: cssStyles }} />}
      <AosInit />
      {headerData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={headerPuckRscConfig as any} data={headerData as Data} />
        : null
      }
      <main>{children}</main>
      {footerData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? <Render config={footerPuckRscConfig as any} data={footerData as Data} />
        : null
      }
    </>
  )
}
