'use client'
import { useState } from 'react'
import { siteLogoAlign, siteLogoCellHeight } from '@/lib/puck/siteLogoAlign'
import { sanitizeHref } from '@/lib/email-obfuscate'
import type { ResponsiveValue } from '@/lib/puck/responsiveValue'

type Props = {
  id?: string
  logoUrl?: string | null
  logoUrlDark?: string | null
  siteName?: string
  // cellHeight/cellHeightShrunk are the current field keys ("Element height" /
  // "Element height when shrunk"). logoHeight/logoHeightShrunk are accepted as a
  // fallback so pre-rename saved data (and SiteHeaderBlock, which still passes
  // logoHeight) keeps rendering without a data migration.
  cellHeight?: ResponsiveValue<number> | number
  cellHeightShrunk?: number
  logoHeight?: number
  logoHeightShrunk?: number
  showTextWithLogo?: string | boolean
  showIcon?: string | boolean
  textColor?: string
  align?: ResponsiveValue<string> | string
  homeUrl?: string
  [key: string]: unknown
}

export default function SiteLogoClient({
  id,
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
  align,
  homeUrl = '/',
}: Props) {
  const [hovered, setHovered] = useState(false)

  // Per-breakpoint element height; siteLogoCellHeight handles the legacy
  // plain-number shape and the pre-rename logoHeight fallback.
  const { base: cellH, css: cellHCss } = siteLogoCellHeight(id, cellHeight, logoHeight)
  const cellHShrunk = cellHeightShrunk ?? logoHeightShrunk
  const href = sanitizeHref(homeUrl) || '/'
  const showTextBool = showTextWithLogo === true || (showTextWithLogo as string) === 'true'
  const showIconBool = showIcon !== false && (showIcon as string) !== 'false'
  // Alignment: see siteLogoAlign - SiteLogoRsc does exactly this, from the same
  // helper, so the two halves cannot drift apart.
  const { justifyContent, css: alignCss } = siteLogoAlign(id, align)

  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent,
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
    // swaps the variable. object-fit:contain + width:auto preserve the logo's
    // aspect ratio as the height changes.
    //
    // No `transition` inline on purpose: the height is resolved from an inline
    // desktop base plus in-body <style> media rules that shrink it on mobile.
    // On a first, uncached load the base can paint before those media rules
    // apply, so an armed transition would animate the big->correct height change
    // and the logo visibly loads oversized then shrinks. The transition is
    // instead armed via data-shrink-ready, which HeaderShrinkScroll sets only
    // after mount - past first paint - so the initial responsive resolution
    // never animates and only the scroll-shrink does. (height stays animatable
    // via a variable - no @property needed.)
    const logoImgStyle = {
      '--header-cell-height': `${cellH}px`,
      height: 'var(--header-cell-height)',
      width: 'auto',
      maxWidth: '100%',
      objectFit: 'contain',
    } as React.CSSProperties
    return (
      <a href={href} data-sitelogo-id={id} style={style} {...events}>
        {alignCss && <style>{alignCss}</style>}
        {cellHCss && <style>{cellHCss}</style>}
        <style>{`header[data-shrink-ready] img[data-site-logo]{transition:height 0.25s ease;}`}</style>
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
    <a href={href} data-sitelogo-id={id} style={style} {...events}>
      {alignCss && <style>{alignCss}</style>}
      {showIconBool && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/cactus.svg" alt="Cactus Foundation" style={{ height: 28, width: 28, flexShrink: 0 }} />
      )}
      {siteName ?? 'Site Name'}
    </a>
  )
}
