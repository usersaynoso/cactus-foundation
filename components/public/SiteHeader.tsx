import { prisma } from '@/lib/db/prisma'
import { resolveMenu } from '@/lib/menu/resolve'
import MenuBlockClient from '@/lib/puck/components/MenuBlockClient'

type HeaderConfig = {
  bgColor?: string
  bgMode?: string
  height?: string
  sticky?: string
  borderBottom?: string
  borderColor?: string
  maxWidth?: string
  logoHeight?: number
  showTextWithLogo?: string
  logoHomeUrl?: string
  itemFontSize?: string
  itemFontWeight?: string
  itemColor?: string
  showMobileToggle?: string
}

export default async function SiteHeader() {
  const config = await prisma.siteConfig
    .findUnique({
      where: { id: 'singleton' },
      select: {
        siteName: true,
        logoMediaId: true,
        mainMenuId: true,
        headerConfig: true,
      },
    })
    .catch(() => null)

  if (!config) return null

  const logoMedia = config.logoMediaId
    ? await prisma.media
        .findUnique({ where: { id: config.logoMediaId }, select: { url: true } })
        .catch(() => null)
    : null

  const menuItems = config.mainMenuId
    ? await resolveMenu(config.mainMenuId).catch(() => [])
    : []

  const hc = (config.headerConfig ?? {}) as HeaderConfig

  const bgMode = hc.bgMode ?? 'color'
  const bgColor = hc.bgColor ?? 'var(--color-bg)'
  const height = hc.height ?? '64px'
  const sticky = hc.sticky ?? 'yes'
  const borderBottom = hc.borderBottom ?? 'show'
  const borderColor = hc.borderColor ?? 'var(--color-border)'
  const maxWidth = hc.maxWidth ?? '1200px'
  const logoHeight = hc.logoHeight ?? 40
  const showTextWithLogo = hc.showTextWithLogo ?? 'false'
  const logoHomeUrl = hc.logoHomeUrl ?? '/'
  const itemFontSize = hc.itemFontSize ?? 'medium'
  const itemFontWeight = hc.itemFontWeight ?? 'medium'
  const itemColor = hc.itemColor ?? ''
  const showMobileToggle = hc.showMobileToggle ?? 'collapse'

  const logoUrl = logoMedia?.url ?? null
  const siteName = config.siteName ?? 'Site Name'
  const showText = showTextWithLogo === 'true'

  return (
    <header
      data-bg-mode={bgMode}
      style={{
        height: height === 'auto' ? undefined : height,
        minHeight: height === 'auto' ? 48 : undefined,
        background: bgMode === 'transparent' ? 'transparent' : bgColor,
        borderBottom: borderBottom === 'show' ? `1px solid ${borderColor}` : 'none',
        position: sticky === 'yes' ? 'sticky' : 'relative',
        top: sticky === 'yes' ? 0 : undefined,
        zIndex: sticky === 'yes' ? 100 : undefined,
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: maxWidth === 'none' ? '100%' : maxWidth,
          margin: '0 auto',
          padding: '0 1.5rem',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
        }}
      >
        {/* Logo - left */}
        <a
          href={logoHomeUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 700,
            fontSize: '1.125rem',
            color: 'var(--color-fg)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          {logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={siteName} style={{ height: logoHeight, width: 'auto' }} />
              {showText && <span>{siteName}</span>}
            </>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cactus.svg" alt="Cactus" style={{ height: 28, width: 28, flexShrink: 0 }} />
              <span>{siteName}</span>
            </>
          )}
        </a>

        {/* Navigation - right */}
        {menuItems.length > 0 && (
          <MenuBlockClient
            resolvedItems={menuItems}
            spacing="normal"
            itemFontSize={itemFontSize as 'small' | 'medium' | 'large'}
            itemFontWeight={itemFontWeight as 'normal' | 'medium' | 'semibold' | 'bold'}
            textTransform="none"
            itemColor={itemColor}
            showMobileToggle={showMobileToggle}
          />
        )}
      </div>
    </header>
  )
}
