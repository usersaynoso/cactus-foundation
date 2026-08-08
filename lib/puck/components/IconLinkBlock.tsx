import React from 'react'

// Icon Link — a small icon that links somewhere, built for header/footer icon
// rows (sits happily next to ThemeToggle, Members: Sign In and the shop
// basket). The icon is either one of the built-in outlines below or an image
// from the media library (SVG or PNG). Rendered identically by the editor and
// the published (RSC) paths — the RSC half in IconLinkRsc.tsx only adds the
// admin-audience gate and then renders this exact component.
//
// Colour: resting and hover colours come as CSS colour values (site palette
// vars or light-dark() composites from SiteColourField) carried on custom
// properties; the .icon-link-trigger rules in globals.css fall back to the
// same tokens the theme toggle's cycle button uses (--color-text-muted resting,
// --color-primary hover) so the two match out of the box.

export type IconLinkProps = {
  icon?: string
  iconUrl?: string
  tint?: string
  href?: string
  newTab?: string
  title?: string
  iconSize?: number
  iconColour?: string
  hoverColour?: string
  audience?: string
  puck?: { isEditing?: boolean }
}

const stroke = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

// Sized by the `.icon-link-trigger > svg` rule (var(--il-icon)), same trick the
// theme toggle uses, so the width/height attributes here are only a fallback.
const icon = (children: React.ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true">{children}</svg>
)

export const ICON_LINK_ICONS: Record<string, { label: string; node: React.ReactNode }> = {
  grid:  { label: 'Grid of squares', node: icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>) },
  plan:  { label: 'Floor plan', node: icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 12h7M12 12v9M12 3v5" /></>) },
  map:   { label: 'Map', node: icon(<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>) },
  pin:   { label: 'Location pin', node: icon(<><path d="M12 21s-7-5.1-7-11a7 7 0 0 1 14 0c0 5.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>) },
  star:  { label: 'Star', node: icon(<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" />) },
  heart: { label: 'Heart', node: icon(<path d="M19.5 12.6 12 20l-7.5-7.4a5 5 0 1 1 7-7.1l.5.5.5-.5a5 5 0 1 1 7 7.1z" />) },
  info:  { label: 'Info', node: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M12 12v4" /></>) },
  chat:  { label: 'Speech bubble', node: icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />) },
  doc:   { label: 'Document', node: icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>) },
}

// Editor-only stand-in while no image is picked: a dashed box, so the block can
// still be found and selected on the canvas. Published pages render nothing.
const placeholder = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} strokeDasharray="3 3" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 12h6" />
  </svg>
)

export function IconLinkBlock(props: IconLinkProps) {
  const {
    icon: iconKey = 'custom', iconUrl = '', tint = 'tint', href = '/', newTab = 'no',
    title = '', iconSize = 20, iconColour = '', hoverColour = '', puck,
  } = props

  const builtin = ICON_LINK_ICONS[iconKey]
  let iconNode: React.ReactNode = null
  if (builtin) {
    iconNode = builtin.node
  } else if (iconUrl) {
    iconNode = tint === 'original' ? (
      // Arbitrary-origin media URL rendered at icon size - next/image's loader
      // pipeline buys nothing here, and the RSC render path must stay free of
      // client-only image machinery.
      // eslint-disable-next-line @next/next/no-img-element
      <img className="icon-link-img" src={iconUrl} alt="" />
    ) : (
      // currentColor box masked by the image's alpha channel, so the colour
      // fields (and their light/dark arms) recolour the uploaded icon exactly
      // as they do the built-in ones.
      <span
        className="icon-link-mask"
        style={{ WebkitMaskImage: `url(${iconUrl})`, maskImage: `url(${iconUrl})` }}
        aria-hidden="true"
      />
    )
  } else if (puck?.isEditing) {
    iconNode = placeholder
  }
  if (!iconNode) return null

  const vars: Record<string, string> = { '--il-icon': `${iconSize || 20}px` }
  if (iconColour) vars['--il-fg'] = iconColour
  if (hoverColour) vars['--il-fg-hover'] = hoverColour

  const external = newTab === 'yes'
  return (
    <a
      className="icon-link-trigger"
      href={href || '#'}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      aria-label={title || 'Icon link'}
      style={vars as React.CSSProperties}
    >
      {iconNode}
      {title && <span className="icon-link-tip" aria-hidden="true">{title}</span>}
    </a>
  )
}
