// Puck component config — imported by both the editor (client) and the public
// render path (server). Only type imports from @puckeditor/core so this file
// is safe for server components. No hooks, no browser-specific APIs.

import React from 'react'
import type { Config } from '@puckeditor/core'

// ---------------------------------------------------------------------------
// Component render functions
// Puck wraps every component's props with { id, puck, ...rest } at runtime,
// so render functions must accept unknown extra props.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function Hero(props: any) {
  const { heading, subheading, ctaLabel, ctaHref } = props as {
    heading: string; subheading: string; ctaLabel: string; ctaHref: string
  }
  return (
    <section style={{
      padding: '4rem 1.5rem',
      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      textAlign: 'center',
      borderRadius: 8,
      marginBottom: '2rem',
    }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 800, margin: '0 0 1rem', lineHeight: 1.2, color: '#111827' }}>
        {heading}
      </h1>
      {subheading && (
        <p style={{ fontSize: '1.125rem', color: '#6b7280', margin: '0 0 2rem', maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
          {subheading}
        </p>
      )}
      {ctaLabel && ctaHref && (
        <a
          href={ctaHref}
          style={{
            display: 'inline-block', padding: '0.75rem 1.75rem',
            background: '#16a34a', color: '#fff', borderRadius: 6,
            fontWeight: 600, textDecoration: 'none', fontSize: '1rem',
          }}
        >
          {ctaLabel}
        </a>
      )}
    </section>
  )
}

function TextBlock(props: any) {
  const { content, align } = props as { content: string; align: 'left' | 'center' | 'right' }
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        lineHeight: 1.75,
        color: '#374151',
        textAlign: align ?? 'left',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </div>
  )
}

function ImageBlock(props: any) {
  const { mediaUrl, alt, caption } = props as { mediaUrl: string; alt: string; caption: string }
  if (!mediaUrl) {
    return (
      <div style={{
        marginBottom: '1.5rem',
        background: '#f3f4f6',
        borderRadius: 6,
        padding: '3rem',
        textAlign: 'center',
        color: '#9ca3af',
        fontSize: '0.875rem',
      }}>
        No image selected
      </div>
    )
  }
  return (
    <figure style={{ margin: '0 0 1.5rem' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl}
        alt={alt ?? ''}
        style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block' }}
      />
      {caption && (
        <figcaption style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

function ButtonLink(props: any) {
  const { label, href, variant } = props as { label: string; href: string; variant: string }
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: '#16a34a', color: '#fff', border: 'none' },
    secondary: { background: '#4b5563', color: '#fff', border: 'none' },
    outline:   { background: 'transparent', color: '#16a34a', border: '2px solid #16a34a' },
  }
  const variantStyle = styles[variant] ?? styles.primary
  return (
    <div style={{ marginBottom: '1rem' }}>
      <a
        href={href}
        style={{
          display: 'inline-block', padding: '0.625rem 1.5rem',
          borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '0.9375rem',
          ...variantStyle,
        }}
      >
        {label}
      </a>
    </div>
  )
}

// Slot-typed fields arrive as callable SlotComponent functions from Puck's render machinery.
function Columns(props: any) {
  const { left, right, ratio } = props as { left: any; right: any; ratio: string }
  const ratios: Record<string, [string, string]> = {
    '50/50': ['1 1 50%', '1 1 50%'],
    '60/40': ['1 1 60%', '1 1 40%'],
    '40/60': ['1 1 40%', '1 1 60%'],
  }
  const defaultPair: [string, string] = ['1 1 50%', '1 1 50%']
  const pair = ratios[ratio] ?? defaultPair
  const leftFlex  = pair[0]
  const rightFlex = pair[1]
  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
      <div style={{ flex: leftFlex, minWidth: 200 }}>
        {typeof left === 'function' ? left() : null}
      </div>
      <div style={{ flex: rightFlex, minWidth: 200 }}>
        {typeof right === 'function' ? right() : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New blocks
// ---------------------------------------------------------------------------

function Divider(props: any) {
  const { style, color, thickness } = props as {
    style: 'solid' | 'dashed' | 'dotted'
    color: 'gray' | 'black' | 'green'
    thickness: 'thin' | 'medium' | 'thick'
  }
  const colors: Record<string, string> = { gray: '#d1d5db', black: '#111827', green: '#16a34a' }
  const heights: Record<string, string> = { thin: '1px', medium: '2px', thick: '4px' }
  return (
    <hr style={{
      border: 'none',
      borderTop: `${heights[thickness] ?? '1px'} ${style ?? 'solid'} ${colors[color] ?? colors.gray}`,
      margin: '1.5rem 0',
    }} />
  )
}

function Spacer(props: any) {
  const { height } = props as { height: string }
  const heights: Record<string, number> = { xs: 8, sm: 16, md: 32, lg: 64, xl: 96 }
  return <div style={{ height: heights[height] ?? 32 }} />
}

function Heading(props: any) {
  const { text, level, align, color } = props as {
    text: string
    level: 'h2' | 'h3' | 'h4' | 'h5'
    align: 'left' | 'center' | 'right'
    color: 'dark' | 'muted' | 'brand'
  }
  const colors: Record<string, string> = { dark: '#111827', muted: '#6b7280', brand: '#16a34a' }
  const sizes: Record<string, string> = { h2: '1.875rem', h3: '1.5rem', h4: '1.25rem', h5: '1.125rem' }
  const weights: Record<string, number> = { h2: 800, h3: 700, h4: 700, h5: 600 }
  const Tag = (level ?? 'h2') as 'h2' | 'h3' | 'h4' | 'h5'
  return (
    <Tag style={{
      fontSize: sizes[level] ?? sizes.h2,
      fontWeight: weights[level] ?? 700,
      color: colors[color] ?? colors.dark,
      textAlign: align ?? 'left',
      margin: '0 0 1rem',
      lineHeight: 1.25,
    }}>
      {text}
    </Tag>
  )
}

function Quote(props: any) {
  const { quote, attribution } = props as { quote: string; attribution: string }
  return (
    <blockquote style={{
      margin: '0 0 1.5rem',
      padding: '1.25rem 1.5rem',
      borderLeft: '4px solid #16a34a',
      background: '#f9fafb',
      borderRadius: '0 6px 6px 0',
    }}>
      <p style={{ margin: 0, fontSize: '1.125rem', fontStyle: 'italic', color: '#374151', lineHeight: 1.7 }}>
        {quote}
      </p>
      {attribution && (
        <footer style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#6b7280', fontStyle: 'normal' }}>
          — {attribution}
        </footer>
      )}
    </blockquote>
  )
}

function Callout(props: any) {
  const { type, title, body } = props as {
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    body: string
  }
  const themes: Record<string, { bg: string; border: string; icon: string; titleColor: string }> = {
    info:    { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ️', titleColor: '#1d4ed8' },
    success: { bg: '#f0fdf4', border: '#16a34a', icon: '✅', titleColor: '#15803d' },
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: '⚠️', titleColor: '#b45309' },
    error:   { bg: '#fef2f2', border: '#ef4444', icon: '❌', titleColor: '#b91c1c' },
  }
  const t = themes[type] ?? { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ️', titleColor: '#1d4ed8' }
  return (
    <div style={{
      background: t.bg,
      borderLeft: `4px solid ${t.border}`,
      borderRadius: '0 6px 6px 0',
      padding: '1rem 1.25rem',
      marginBottom: '1.5rem',
    }}>
      {title && (
        <p style={{ margin: '0 0 0.375rem', fontWeight: 700, color: t.titleColor, fontSize: '0.9375rem' }}>
          {t.icon} {title}
        </p>
      )}
      <p style={{ margin: 0, color: '#374151', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{body}</p>
    </div>
  )
}

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`
    }
    if (u.hostname.includes('vimeo.com')) {
      return `https://player.vimeo.com/video${u.pathname}`
    }
    return url
  } catch { return null }
}

function VideoEmbed(props: any) {
  const { url, aspectRatio, title } = props as { url: string; aspectRatio: string; title: string }
  if (!url) {
    return (
      <div style={{
        background: '#f3f4f6', borderRadius: 6, padding: '3rem',
        textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem',
      }}>
        No video URL entered
      </div>
    )
  }
  const embedUrl = toEmbedUrl(url)
  if (!embedUrl) {
    return (
      <div style={{
        background: '#fef2f2', borderRadius: 6, padding: '1rem',
        color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.5rem',
      }}>
        Could not parse video URL
      </div>
    )
  }
  const paddings: Record<string, string> = { '16:9': '56.25%', '4:3': '75%', '1:1': '100%' }
  const paddingBottom = paddings[aspectRatio] ?? '56.25%'
  return (
    <div style={{ position: 'relative', paddingBottom, height: 0, overflow: 'hidden', borderRadius: 6, marginBottom: '1.5rem' }}>
      <iframe
        src={embedUrl}
        title={title || 'Video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}

function Card(props: any) {
  const { mediaUrl, alt, heading, body, ctaLabel, ctaHref } = props as {
    mediaUrl: string; alt: string; heading: string; body: string; ctaLabel: string; ctaHref: string
  }
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: '1.5rem',
      background: '#fff',
    }}>
      {mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt={alt ?? ''}
          style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: '1.25rem' }}>
        {heading && (
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
            {heading}
          </h3>
        )}
        {body && (
          <p style={{ margin: '0 0 1rem', color: '#4b5563', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            {body}
          </p>
        )}
        {ctaLabel && ctaHref && (
          <a href={ctaHref} style={{
            display: 'inline-block', padding: '0.5rem 1.25rem',
            background: '#16a34a', color: '#fff', borderRadius: 6,
            fontWeight: 600, textDecoration: 'none', fontSize: '0.875rem',
          }}>
            {ctaLabel}
          </a>
        )}
      </div>
    </div>
  )
}

function CTABanner(props: any) {
  const { heading, subtext, ctaLabel, ctaHref, background } = props as {
    heading: string; subtext: string; ctaLabel: string; ctaHref: string; background: string
  }
  const bgs: Record<string, { bg: string; text: string }> = {
    white: { bg: '#ffffff', text: '#111827' },
    light: { bg: '#f9fafb', text: '#111827' },
    brand: { bg: '#16a34a', text: '#ffffff' },
  }
  const theme = bgs[background] ?? { bg: '#f9fafb', text: '#111827' }
  return (
    <section style={{
      background: theme.bg,
      border: background === 'white' ? '1px solid #e5e7eb' : 'none',
      borderRadius: 8,
      padding: '2.5rem 2rem',
      textAlign: 'center',
      marginBottom: '2rem',
    }}>
      {heading && (
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.75rem', fontWeight: 800, color: theme.text, lineHeight: 1.25 }}>
          {heading}
        </h2>
      )}
      {subtext && (
        <p style={{ margin: '0 0 1.5rem', color: background === 'brand' ? 'rgba(255,255,255,0.85)' : '#6b7280', fontSize: '1rem', lineHeight: 1.65 }}>
          {subtext}
        </p>
      )}
      {ctaLabel && ctaHref && (
        <a href={ctaHref} style={{
          display: 'inline-block', padding: '0.75rem 1.75rem',
          background: background === 'brand' ? '#fff' : '#16a34a',
          color: background === 'brand' ? '#16a34a' : '#fff',
          borderRadius: 6, fontWeight: 600, textDecoration: 'none', fontSize: '1rem',
        }}>
          {ctaLabel}
        </a>
      )}
    </section>
  )
}

function Badge(props: any) {
  const { label, color } = props as { label: string; color: string }
  const colors: Record<string, { bg: string; text: string }> = {
    green:  { bg: '#dcfce7', text: '#15803d' },
    blue:   { bg: '#dbeafe', text: '#1d4ed8' },
    yellow: { bg: '#fef9c3', text: '#a16207' },
    red:    { bg: '#fee2e2', text: '#b91c1c' },
    gray:   { bg: '#f3f4f6', text: '#374151' },
  }
  const theme = colors[color] ?? { bg: '#f3f4f6', text: '#374151' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.25rem 0.625rem',
      borderRadius: 9999,
      fontSize: '0.75rem',
      fontWeight: 600,
      background: theme.bg,
      color: theme.text,
      marginBottom: '0.5rem',
    }}>
      {label}
    </span>
  )
}

function Embed(props: any) {
  const { src, height, title } = props as { src: string; height: string; title: string }
  if (!src) {
    return (
      <div style={{
        background: '#f3f4f6', borderRadius: 6, padding: '3rem',
        textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem',
      }}>
        No embed URL entered
      </div>
    )
  }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <iframe
        src={src}
        title={title || 'Embedded content'}
        style={{ width: '100%', height: height || '400px', border: 'none', borderRadius: 6, display: 'block' }}
        allowFullScreen
      />
    </div>
  )
}

function Accordion(props: any) {
  const { items } = props as { items: Array<{ question: string; answer: string }> }
  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No accordion items yet — add some in the panel.
      </div>
    )
  }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {items.map((item, i) => (
        <details
          key={i}
          style={{
            borderBottom: '1px solid #e5e7eb',
            padding: '0',
          }}
        >
          <summary style={{
            padding: '0.875rem 0',
            fontWeight: 600,
            color: '#111827',
            cursor: 'pointer',
            listStyle: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9375rem',
          }}>
            {item.question}
            <span style={{ fontSize: '1.25rem', color: '#6b7280', flexShrink: 0, marginLeft: '1rem' }}>+</span>
          </summary>
          <p style={{ margin: '0 0 0.875rem', color: '#4b5563', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  )
}

function Stats(props: any) {
  const { items } = props as { items: Array<{ value: string; label: string }> }
  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No stats yet — add some in the panel.
      </div>
    )
  }
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '1.5rem',
      marginBottom: '1.5rem',
    }}>
      {items.map((item, i) => (
        <div key={i} style={{ flex: '1 1 120px', textAlign: 'center', padding: '1.25rem', background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>
            {item.value}
          </div>
          <div style={{ marginTop: '0.375rem', fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function FeatureList(props: any) {
  const { items } = props as { items: Array<{ emoji: string; title: string; description: string }> }
  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No features yet — add some in the panel.
      </div>
    )
  }
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'flex-start' }}>
          {item.emoji && (
            <span style={{ fontSize: '1.75rem', flexShrink: 0, lineHeight: 1 }}>{item.emoji}</span>
          )}
          <div>
            {item.title && (
              <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                {item.title}
              </h4>
            )}
            {item.description && (
              <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.65, fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
                {item.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// SiteLogo — logoUrl and siteName injected server-side; shows placeholder in editor
function SiteLogo(props: any) {
  const { logoUrl, siteName } = props as { logoUrl?: string; siteName?: string }
  if (logoUrl) {
    return (
      <a href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName ?? 'Logo'} style={{ height: 40, width: 'auto' }} />
      </a>
    )
  }
  return (
    <a href="/" style={{ display: 'inline-flex', alignItems: 'center', fontWeight: 700, fontSize: '1.25rem', color: '#111827', textDecoration: 'none', gap: '0.5rem' }}>
      🌵 {siteName ?? 'Site Name'}
    </a>
  )
}

// Copyright — siteName and year injected server-side
function Copyright(props: any) {
  const { siteName, year } = props as { siteName?: string; year?: number }
  return (
    <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.875rem' }}>
      © {year ?? new Date().getFullYear()} {siteName ?? 'My Site'}
    </p>
  )
}

// MenuBlock — resolvedItems injected server-side; shows placeholder otherwise
function MenuBlock(props: any) {
  const { resolvedItems, orientation, spacing } = props as {
    resolvedItems?: Array<{ id: string; label: string; href: string; openInNewTab: boolean; children?: any[] }>
    orientation: 'horizontal' | 'vertical'
    spacing: 'tight' | 'normal' | 'wide'
    showMobileToggle: string
  }

  if (!resolvedItems) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', borderRadius: 6, color: '#9ca3af', fontSize: '0.875rem' }}>
        Menu — configure in editor
      </div>
    )
  }

  const gaps: Record<string, string> = { tight: '0.75rem', normal: '1.25rem', wide: '2rem' }
  const gap = gaps[spacing] ?? '1.25rem'

  if (orientation === 'vertical') {
    return (
      <nav>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap }}>
          {resolvedItems.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                target={item.openInNewTab ? '_blank' : undefined}
                rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                style={{ textDecoration: 'none', color: '#374151', fontWeight: 500, fontSize: '0.9375rem' }}
              >
                {item.label}
              </a>
              {item.children && item.children.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: '0 0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {item.children.map((child: any) => (
                    <li key={child.id}>
                      <a href={child.href} target={child.openInNewTab ? '_blank' : undefined} rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                        style={{ textDecoration: 'none', color: '#6b7280', fontSize: '0.875rem' }}>
                        {child.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    )
  }

  return (
    <nav>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap }}>
        {resolvedItems.map((item) => (
          <li key={item.id} style={{ position: 'relative' }}>
            <a
              href={item.href}
              target={item.openInNewTab ? '_blank' : undefined}
              rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
              style={{ textDecoration: 'none', color: '#374151', fontWeight: 500, fontSize: '0.9375rem' }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// LoginButton — isLoggedIn and adminPath injected server-side
function LoginButton(props: any) {
  const { isLoggedIn, adminPath, loginLabel, registerLabel } = props as {
    isLoggedIn?: boolean
    adminPath?: string
    loginLabel: string
    registerLabel: string
  }
  const base = adminPath ? `/${adminPath}` : ''

  if (isLoggedIn) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <a href={`${base}/account`} style={{
          padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #d1d5db',
          textDecoration: 'none', color: '#374151', fontSize: '0.875rem', fontWeight: 500,
        }}>My Account</a>
        <form action="/api/auth/logout" method="POST" style={{ margin: 0 }}>
          <button type="submit" style={{
            padding: '0.5rem 1rem', borderRadius: 6, background: 'none', border: '1px solid #d1d5db',
            color: '#374151', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}>Sign out</button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <a href={`${base}/login`} style={{
        padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #d1d5db',
        textDecoration: 'none', color: '#374151', fontSize: '0.875rem', fontWeight: 500,
      }}>{loginLabel || 'Sign in'}</a>
      <a href={`${base}/register`} style={{
        padding: '0.5rem 1rem', borderRadius: 6, background: '#16a34a', border: '1px solid #16a34a',
        textDecoration: 'none', color: '#fff', fontSize: '0.875rem', fontWeight: 500,
      }}>{registerLabel || 'Register'}</a>
    </div>
  )
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Config
// root.fields is intentionally omitted here — the editor extends this config
// with full field definitions (including the MediaPickerField custom renderer).
// The public RSC Render only needs root.render and component render functions.
// ---------------------------------------------------------------------------

const puckConfig = {
  root: {
    render: ({ children }: { children: React.ReactNode }) => (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {children}
      </div>
    ),
  },
  components: {
    Hero: {
      fields: {
        heading:    { type: 'text' as const,     label: 'Heading' },
        subheading: { type: 'textarea' as const,  label: 'Sub-heading' },
        ctaLabel:   { type: 'text' as const,     label: 'CTA label' },
        ctaHref:    { type: 'text' as const,     label: 'CTA URL' },
      },
      defaultProps: {
        heading: 'Page heading',
        subheading: '',
        ctaLabel: '',
        ctaHref: '',
      },
      render: Hero,
    },
    TextBlock: {
      fields: {
        content: { type: 'textarea' as const, label: 'Content' },
        align: {
          type: 'select' as const,
          label: 'Alignment',
          options: [
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ],
        },
      },
      defaultProps: {
        content: 'Enter your text here…',
        align: 'left' as const,
      },
      render: TextBlock,
    },
    ImageBlock: {
      fields: {
        mediaUrl: { type: 'text' as const, label: 'Image URL (set via media picker)' },
        mediaId:  { type: 'text' as const, label: 'Media ID' },
        alt:      { type: 'text' as const, label: 'Alt text' },
        caption:  { type: 'text' as const, label: 'Caption' },
      },
      defaultProps: {
        mediaUrl: '',
        mediaId: '',
        alt: '',
        caption: '',
      },
      render: ImageBlock,
    },
    ButtonLink: {
      fields: {
        label: { type: 'text' as const, label: 'Label' },
        href:  { type: 'text' as const, label: 'URL' },
        variant: {
          type: 'select' as const,
          label: 'Style',
          options: [
            { value: 'primary',   label: 'Primary' },
            { value: 'secondary', label: 'Secondary' },
            { value: 'outline',   label: 'Outline' },
          ],
        },
      },
      defaultProps: {
        label: 'Click here',
        href: '#',
        variant: 'primary' as const,
      },
      render: ButtonLink,
    },
    Columns: {
      fields: {
        left:  { type: 'slot' as const },
        right: { type: 'slot' as const },
        ratio: {
          type: 'select' as const,
          label: 'Column ratio',
          options: [
            { value: '50/50', label: '50 / 50' },
            { value: '60/40', label: '60 / 40' },
            { value: '40/60', label: '40 / 60' },
          ],
        },
      },
      defaultProps: {
        ratio: '50/50',
      },
      render: Columns,
    },
    Divider: {
      fields: {
        style: {
          type: 'select' as const,
          label: 'Line style',
          options: [
            { value: 'solid',  label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
          ],
        },
        color: {
          type: 'select' as const,
          label: 'Color',
          options: [
            { value: 'gray',  label: 'Gray' },
            { value: 'black', label: 'Black' },
            { value: 'green', label: 'Green' },
          ],
        },
        thickness: {
          type: 'select' as const,
          label: 'Thickness',
          options: [
            { value: 'thin',   label: 'Thin' },
            { value: 'medium', label: 'Medium' },
            { value: 'thick',  label: 'Thick' },
          ],
        },
      },
      defaultProps: {
        style: 'solid' as const,
        color: 'gray' as const,
        thickness: 'thin' as const,
      },
      render: Divider,
    },
    Spacer: {
      fields: {
        height: {
          type: 'select' as const,
          label: 'Height',
          options: [
            { value: 'xs', label: 'Extra small (8px)' },
            { value: 'sm', label: 'Small (16px)' },
            { value: 'md', label: 'Medium (32px)' },
            { value: 'lg', label: 'Large (64px)' },
            { value: 'xl', label: 'Extra large (96px)' },
          ],
        },
      },
      defaultProps: {
        height: 'md' as const,
      },
      render: Spacer,
    },
    Heading: {
      fields: {
        text:  { type: 'text' as const, label: 'Text' },
        level: {
          type: 'select' as const,
          label: 'Level',
          options: [
            { value: 'h2', label: 'H2' },
            { value: 'h3', label: 'H3' },
            { value: 'h4', label: 'H4' },
            { value: 'h5', label: 'H5' },
          ],
        },
        align: {
          type: 'select' as const,
          label: 'Alignment',
          options: [
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ],
        },
        color: {
          type: 'select' as const,
          label: 'Color',
          options: [
            { value: 'dark',  label: 'Dark' },
            { value: 'muted', label: 'Muted' },
            { value: 'brand', label: 'Brand green' },
          ],
        },
      },
      defaultProps: {
        text: 'Section heading',
        level: 'h2' as const,
        align: 'left' as const,
        color: 'dark' as const,
      },
      render: Heading,
    },
    Quote: {
      fields: {
        quote:       { type: 'textarea' as const, label: 'Quote' },
        attribution: { type: 'text' as const,     label: 'Attribution (optional)' },
      },
      defaultProps: {
        quote: 'Enter a quote here…',
        attribution: '',
      },
      render: Quote,
    },
    Callout: {
      fields: {
        type: {
          type: 'select' as const,
          label: 'Type',
          options: [
            { value: 'info',    label: 'Info' },
            { value: 'success', label: 'Success' },
            { value: 'warning', label: 'Warning' },
            { value: 'error',   label: 'Error' },
          ],
        },
        title: { type: 'text' as const,     label: 'Title (optional)' },
        body:  { type: 'textarea' as const, label: 'Body' },
      },
      defaultProps: {
        type: 'info' as const,
        title: '',
        body: 'Notice text here…',
      },
      render: Callout,
    },
    VideoEmbed: {
      fields: {
        url:         { type: 'text' as const, label: 'Video URL (YouTube or Vimeo)' },
        title:       { type: 'text' as const, label: 'Title (for accessibility)' },
        aspectRatio: {
          type: 'select' as const,
          label: 'Aspect ratio',
          options: [
            { value: '16:9', label: '16:9 (widescreen)' },
            { value: '4:3',  label: '4:3 (standard)' },
            { value: '1:1',  label: '1:1 (square)' },
          ],
        },
      },
      defaultProps: {
        url: '',
        title: '',
        aspectRatio: '16:9' as const,
      },
      render: VideoEmbed,
    },
    Card: {
      fields: {
        mediaUrl: { type: 'text' as const, label: 'Image URL (set via media picker)' },
        mediaId:  { type: 'text' as const, label: 'Media ID' },
        alt:      { type: 'text' as const, label: 'Image alt text' },
        heading:  { type: 'text' as const, label: 'Heading' },
        body:     { type: 'textarea' as const, label: 'Body text' },
        ctaLabel: { type: 'text' as const, label: 'Button label (optional)' },
        ctaHref:  { type: 'text' as const, label: 'Button URL (optional)' },
      },
      defaultProps: {
        mediaUrl: '',
        mediaId: '',
        alt: '',
        heading: 'Card heading',
        body: '',
        ctaLabel: '',
        ctaHref: '',
      },
      render: Card,
    },
    CTABanner: {
      fields: {
        heading:    { type: 'text' as const,     label: 'Heading' },
        subtext:    { type: 'textarea' as const,  label: 'Sub-text' },
        ctaLabel:   { type: 'text' as const,     label: 'Button label' },
        ctaHref:    { type: 'text' as const,     label: 'Button URL' },
        background: {
          type: 'select' as const,
          label: 'Background',
          options: [
            { value: 'light', label: 'Light gray' },
            { value: 'white', label: 'White (with border)' },
            { value: 'brand', label: 'Brand green' },
          ],
        },
      },
      defaultProps: {
        heading: 'Ready to get started?',
        subtext: '',
        ctaLabel: 'Get in touch',
        ctaHref: '#',
        background: 'light' as const,
      },
      render: CTABanner,
    },
    Badge: {
      fields: {
        label: { type: 'text' as const, label: 'Label' },
        color: {
          type: 'select' as const,
          label: 'Color',
          options: [
            { value: 'green',  label: 'Green' },
            { value: 'blue',   label: 'Blue' },
            { value: 'yellow', label: 'Yellow' },
            { value: 'red',    label: 'Red' },
            { value: 'gray',   label: 'Gray' },
          ],
        },
      },
      defaultProps: {
        label: 'New',
        color: 'green' as const,
      },
      render: Badge,
    },
    Embed: {
      fields: {
        src:    { type: 'text' as const, label: 'URL to embed' },
        height: { type: 'text' as const, label: 'Height (e.g. 400px)' },
        title:  { type: 'text' as const, label: 'Title (for accessibility)' },
      },
      defaultProps: {
        src: '',
        height: '400px',
        title: '',
      },
      render: Embed,
    },
    Accordion: {
      fields: {
        items: {
          type: 'array' as const,
          label: 'Items',
          getItemSummary: (item: { question?: string }) => item.question || 'Question',
          arrayFields: {
            question: { type: 'text' as const,     label: 'Question' },
            answer:   { type: 'textarea' as const, label: 'Answer' },
          },
          defaultItemProps: {
            question: 'What is the question?',
            answer: 'This is the answer.',
          },
        },
      },
      defaultProps: {
        items: [
          { question: 'What is the question?', answer: 'This is the answer.' },
        ],
      },
      render: Accordion,
    },
    Stats: {
      fields: {
        items: {
          type: 'array' as const,
          label: 'Stats',
          getItemSummary: (item: { value?: string; label?: string }) => item.value ? `${item.value} — ${item.label}` : 'Stat',
          arrayFields: {
            value: { type: 'text' as const, label: 'Value (e.g. 10,000+)' },
            label: { type: 'text' as const, label: 'Label' },
          },
          defaultItemProps: {
            value: '100%',
            label: 'Satisfaction',
          },
        },
      },
      defaultProps: {
        items: [
          { value: '10k+', label: 'Customers' },
          { value: '99%',  label: 'Uptime' },
          { value: '24/7', label: 'Support' },
        ],
      },
      render: Stats,
    },
    FeatureList: {
      fields: {
        items: {
          type: 'array' as const,
          label: 'Features',
          getItemSummary: (item: { title?: string }) => item.title || 'Feature',
          arrayFields: {
            emoji:       { type: 'text' as const,     label: 'Emoji or icon' },
            title:       { type: 'text' as const,     label: 'Title' },
            description: { type: 'textarea' as const, label: 'Description' },
          },
          defaultItemProps: {
            emoji: '✨',
            title: 'Feature title',
            description: 'Describe this feature here.',
          },
        },
      },
      defaultProps: {
        items: [
          { emoji: '✨', title: 'Feature one', description: 'Describe this feature here.' },
          { emoji: '🚀', title: 'Feature two', description: 'Describe this feature here.' },
        ],
      },
      render: FeatureList,
    },
    SiteLogo: {
      fields: {},
      defaultProps: {},
      render: SiteLogo,
    },
    Copyright: {
      fields: {},
      defaultProps: {},
      render: Copyright,
    },
    MenuBlock: {
      fields: {
        menuId:   { type: 'text' as const, label: 'Menu ID (use the menu selector field in editor)' },
        menuName: { type: 'text' as const, label: 'Menu name (display only)' },
        orientation: {
          type: 'select' as const,
          label: 'Orientation',
          options: [
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical',   label: 'Vertical' },
          ],
        },
        spacing: {
          type: 'select' as const,
          label: 'Item spacing',
          options: [
            { value: 'tight',  label: 'Tight' },
            { value: 'normal', label: 'Normal' },
            { value: 'wide',   label: 'Wide' },
          ],
        },
        showDropdowns: {
          type: 'select' as const,
          label: 'Dropdowns open on',
          options: [
            { value: 'hover', label: 'Hover' },
            { value: 'click', label: 'Click' },
          ],
        },
        showMobileToggle: {
          type: 'select' as const,
          label: 'Mobile behaviour',
          options: [
            { value: 'collapse', label: 'Collapse to hamburger' },
            { value: 'show',     label: 'Always show' },
          ],
        },
      },
      defaultProps: {
        menuId:           '',
        menuName:         '',
        orientation:      'horizontal' as const,
        spacing:          'normal' as const,
        showDropdowns:    'hover',
        showMobileToggle: 'collapse',
      },
      render: MenuBlock,
    },
    LoginButton: {
      fields: {
        loginLabel:    { type: 'text' as const, label: 'Login button label' },
        registerLabel: { type: 'text' as const, label: 'Register button label' },
      },
      defaultProps: {
        loginLabel:    'Sign in',
        registerLabel: 'Register',
      },
      render: LoginButton,
    },
  },
} satisfies Config

export default puckConfig
export type PuckConfig = typeof puckConfig

// Template config — same blocks as puckConfig but with a passthrough root render
// (no max-width wrapper) so templates can control their own layout.
export const puckTemplateConfig = {
  ...puckConfig,
  root: {
    render: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}
