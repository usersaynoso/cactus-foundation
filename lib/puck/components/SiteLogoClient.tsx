'use client'
import { useState } from 'react'

type Props = {
  logoUrl?: string | null
  logoUrlDark?: string | null
  siteName?: string
  logoHeight?: number
  showTextWithLogo?: string | boolean
  showIcon?: string | boolean
  textColor?: string
  homeUrl?: string
  [key: string]: unknown
}

export default function SiteLogoClient({
  logoUrl,
  logoUrlDark,
  siteName,
  logoHeight = 40,
  showTextWithLogo = 'false',
  showIcon = 'true',
  textColor,
  homeUrl = '/',
}: Props) {
  const [hovered, setHovered] = useState(false)

  const href = homeUrl || '/'
  const showTextBool = showTextWithLogo === true || (showTextWithLogo as string) === 'true'
  const showIconBool = showIcon !== false && (showIcon as string) !== 'false'

  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontWeight: 700,
    fontSize: '1.125rem',
    color: hovered ? 'var(--color-primary)' : (textColor || 'var(--color-text)'),
    textDecoration: 'none',
    transition: 'color 0.15s',
  }

  const events = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }

  if (logoUrl) {
    return (
      <a href={href} style={style} {...events}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName ?? 'Logo'} data-logo-variant={logoUrlDark ? 'light' : undefined} style={{ height: logoHeight, width: 'auto' }} />
        {logoUrlDark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrlDark} alt={siteName ?? 'Logo'} data-logo-variant="dark" style={{ height: logoHeight, width: 'auto' }} />
        )}
        {showTextBool && siteName && <span>{siteName}</span>}
      </a>
    )
  }

  return (
    <a href={href} style={style} {...events}>
      {showIconBool && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/cactus.svg" alt="Cactus Foundation" style={{ height: 28, width: 28, flexShrink: 0 }} />
      )}
      {siteName ?? 'Site Name'}
    </a>
  )
}
