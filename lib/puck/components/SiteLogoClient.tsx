'use client'
import { useState } from 'react'

type Props = {
  logoUrl?: string | null
  logoUrlDark?: string | null
  siteName?: string
  // cellHeight/cellHeightShrunk are the current field keys ("Element height" /
  // "Element height when shrunk"). logoHeight/logoHeightShrunk are accepted as a
  // fallback so pre-rename saved data (and SiteHeaderBlock, which still passes
  // logoHeight) keeps rendering without a data migration.
  cellHeight?: number
  cellHeightShrunk?: number
  logoHeight?: number
  logoHeightShrunk?: number
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
  cellHeight,
  cellHeightShrunk,
  logoHeight,
  logoHeightShrunk,
  showTextWithLogo = 'false',
  showIcon = 'true',
  textColor,
  homeUrl = '/',
}: Props) {
  const [hovered, setHovered] = useState(false)

  const cellH = cellHeight ?? logoHeight ?? 40
  const cellHShrunk = cellHeightShrunk ?? logoHeightShrunk
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
    // The logo image is sized by a shared --header-cell-height custom property
    // rather than a hard-coded height, so on shrink the override below just
    // swaps the variable. transition:height animates the resolved height change
    // (no @property needed - height is animatable regardless of the value
    // arriving via a variable). object-fit:contain + width:auto preserve the
    // logo's aspect ratio as the height changes.
    const logoImgStyle = {
      '--header-cell-height': `${cellH}px`,
      height: 'var(--header-cell-height)',
      width: 'auto',
      maxWidth: '100%',
      objectFit: 'contain',
      transition: 'height 0.25s ease',
    } as React.CSSProperties
    return (
      <a href={href} style={style} {...events}>
        {cellHShrunk && (
          <style>{`header[data-shrink-root][data-shrunk] img[data-site-logo]{--header-cell-height:${cellHShrunk}px !important;}`}</style>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName ?? 'Logo'} data-logo-variant={logoUrlDark ? 'light' : undefined} data-site-logo style={logoImgStyle} />
        {logoUrlDark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrlDark} alt={siteName ?? 'Logo'} data-logo-variant="dark" data-site-logo style={logoImgStyle} />
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
