// Puck component config — imported by both the editor (client) and the public
// render path (server). Only type imports from @puckeditor/core so this file
// is safe for server components. No hooks, no browser-specific APIs.

import React from 'react'
import type { Config } from '@puckeditor/core'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Padding utilities
// ---------------------------------------------------------------------------

const PADDING_MAP: Record<string, string> = {
  none: '0',
  sm:   '0.5rem',
  md:   '1rem',
  lg:   '2rem',
  xl:   '4rem',
}

function getPadding(p?: string): string {
  return PADDING_MAP[p ?? 'none'] ?? '0'
}

const paddingField = {
  type: 'select' as const,
  label: 'Padding',
  options: [
    { value: 'none', label: 'None' },
    { value: 'sm',   label: 'Small (0.5rem)' },
    { value: 'md',   label: 'Medium (1rem)' },
    { value: 'lg',   label: 'Large (2rem)' },
    { value: 'xl',   label: 'Extra large (4rem)' },
  ],
}

const GAP_MAP: Record<string, string> = { none: '0', sm: '0.5rem', md: '1rem', lg: '2rem' }

// ---------------------------------------------------------------------------
// Layout blocks
// ---------------------------------------------------------------------------

function GridBlock(props: any) {
  const { columns, gap, padding, col1, col2, col3, col4 } = props
  const colCount = parseInt(columns ?? '2', 10)
  const slots = [col1, col2, col3, col4].slice(0, colCount)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${colCount}, 1fr)`,
      gap: GAP_MAP[gap] ?? '1rem',
      padding: getPadding(padding),
      marginBottom: '1.5rem',
    }}>
      {slots.map((slot, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          {typeof slot === 'function' ? slot() : null}
        </div>
      ))}
    </div>
  )
}

function FlexBlock(props: any) {
  const { direction, justify, align, wrap, gap, padding, items } = props
  const justifyMap: Record<string, string> = {
    start: 'flex-start', center: 'center', end: 'flex-end',
    between: 'space-between', around: 'space-around', evenly: 'space-evenly',
  }
  const alignMap: Record<string, string> = {
    start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch',
  }
  return (
    <div style={{
      display: 'flex',
      flexDirection: direction === 'column' ? 'column' : 'row',
      justifyContent: justifyMap[justify] ?? 'flex-start',
      alignItems: alignMap[align] ?? 'stretch',
      flexWrap: wrap === 'wrap' ? 'wrap' : 'nowrap',
      gap: GAP_MAP[gap] ?? '1rem',
      padding: getPadding(padding),
      marginBottom: '1.5rem',
    }}>
      {typeof items === 'function' ? items() : null}
    </div>
  )
}

function Columns(props: any) {
  const { left, right, ratio, padding } = props as { left: any; right: any; ratio: string; padding: string }
  const ratios: Record<string, [string, string]> = {
    '50/50': ['1 1 50%', '1 1 50%'],
    '60/40': ['1 1 60%', '1 1 40%'],
    '40/60': ['1 1 40%', '1 1 60%'],
  }
  const defaultPair: [string, string] = ['1 1 50%', '1 1 50%']
  const pair = ratios[ratio] ?? defaultPair
  return (
    <div style={{
      display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
      marginBottom: '1.5rem', padding: getPadding(padding),
    }}>
      <div style={{ flex: pair[0], minWidth: 200 }}>
        {typeof left === 'function' ? left() : null}
      </div>
      <div style={{ flex: pair[1], minWidth: 200 }}>
        {typeof right === 'function' ? right() : null}
      </div>
    </div>
  )
}

function Spacer(props: any) {
  const { height } = props as { height: string }
  const heights: Record<string, number> = { xs: 8, sm: 16, md: 32, lg: 64, xl: 96 }
  return <div style={{ height: heights[height] ?? 32 }} />
}

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

// ---------------------------------------------------------------------------
// Typography blocks
// ---------------------------------------------------------------------------

function Heading(props: any) {
  const { text, level, align, color, padding } = props as {
    text: string; level: 'h2' | 'h3' | 'h4' | 'h5'
    align: 'left' | 'center' | 'right'; color: 'dark' | 'muted' | 'brand'
    padding: string
  }
  const colors: Record<string, string> = { dark: '#111827', muted: '#6b7280', brand: '#16a34a' }
  const sizes: Record<string, string> = { h2: '1.875rem', h3: '1.5rem', h4: '1.25rem', h5: '1.125rem' }
  const weights: Record<string, number> = { h2: 800, h3: 700, h4: 700, h5: 600 }
  const Tag = (level ?? 'h2') as 'h2' | 'h3' | 'h4' | 'h5'
  return (
    <div style={{ padding: getPadding(padding) }}>
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
    </div>
  )
}

function TextBlock(props: any) {
  const { content, align, padding } = props as {
    content: string; align: 'left' | 'center' | 'right'; padding: string
  }
  return (
    <div style={{
      marginBottom: '1.5rem',
      lineHeight: 1.75,
      color: '#374151',
      textAlign: align ?? 'left',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      padding: getPadding(padding),
    }}>
      {content}
    </div>
  )
}

function RichTextBlock(props: any) {
  const { content, padding } = props as { content: string; padding: string }
  if (!content) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: getPadding(padding) }}>
        Rich text — edit in the panel
      </div>
    )
  }
  return (
    <div
      className="puck-richtext"
      style={{ padding: getPadding(padding) }}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}

function Quote(props: any) {
  const { quote, attribution, padding } = props as {
    quote: string; attribution: string; padding: string
  }
  return (
    <div style={{ padding: getPadding(padding) }}>
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action blocks
// ---------------------------------------------------------------------------

function ButtonLink(props: any) {
  const { label, href, variant, padding } = props as {
    label: string; href: string; variant: string; padding: string
  }
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: '#16a34a', color: '#fff', border: 'none' },
    secondary: { background: '#4b5563', color: '#fff', border: 'none' },
    outline:   { background: 'transparent', color: '#16a34a', border: '2px solid #16a34a' },
  }
  const variantStyle = styles[variant] ?? styles.primary
  return (
    <div style={{ marginBottom: '1rem', padding: getPadding(padding) }}>
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

function CTABanner(props: any) {
  const { heading, subtext, ctaLabel, ctaHref, background, padding } = props as {
    heading: string; subtext: string; ctaLabel: string; ctaHref: string
    background: string; padding: string
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
      padding: getPadding(padding) || '2.5rem 2rem',
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

// ---------------------------------------------------------------------------
// Media blocks
// ---------------------------------------------------------------------------

function ImageBlock(props: any) {
  const { mediaUrl, alt, caption, padding } = props as {
    mediaUrl: string; alt: string; caption: string; padding: string
  }
  if (!mediaUrl) {
    return (
      <div style={{
        marginBottom: '1.5rem',
        background: '#f3f4f6', borderRadius: 6, padding: '3rem',
        textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem',
      }}>
        No image selected
      </div>
    )
  }
  return (
    <figure style={{ margin: '0 0 1.5rem', padding: getPadding(padding) }}>
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
  const { url, aspectRatio, title, padding } = props as {
    url: string; aspectRatio: string; title: string; padding: string
  }
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
    <div style={{ padding: getPadding(padding), marginBottom: '1.5rem' }}>
      <div style={{ position: 'relative', paddingBottom, height: 0, overflow: 'hidden', borderRadius: 6 }}>
        <iframe
          src={embedUrl}
          title={title || 'Video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  )
}

function Embed(props: any) {
  const { src, height, title, padding } = props as {
    src: string; height: string; title: string; padding: string
  }
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
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }}>
      <iframe
        src={src}
        title={title || 'Embedded content'}
        style={{ width: '100%', height: height || '400px', border: 'none', borderRadius: 6, display: 'block' }}
        allowFullScreen
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

function Hero(props: any) {
  const { heading, subheading, ctaLabel, ctaHref, padding } = props as {
    heading: string; subheading: string; ctaLabel: string; ctaHref: string; padding: string
  }
  return (
    <section style={{
      padding: getPadding(padding) || '4rem 1.5rem',
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

function Card(props: any) {
  const { mediaUrl, alt, heading, body, ctaLabel, ctaHref, padding } = props as {
    mediaUrl: string; alt: string; heading: string; body: string
    ctaLabel: string; ctaHref: string; padding: string
  }
  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden',
      marginBottom: '1.5rem', background: '#fff', padding: getPadding(padding),
    }}>
      {mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl} alt={alt ?? ''}
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

function Callout(props: any) {
  const { type, title, body, padding } = props as {
    type: 'info' | 'success' | 'warning' | 'error'
    title: string; body: string; padding: string
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
      background: t.bg, borderLeft: `4px solid ${t.border}`,
      borderRadius: '0 6px 6px 0', padding: getPadding(padding) || '1rem 1.25rem',
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

function Badge(props: any) {
  const { label, color, padding } = props as { label: string; color: string; padding: string }
  const colors: Record<string, { bg: string; text: string }> = {
    green:  { bg: '#dcfce7', text: '#15803d' },
    blue:   { bg: '#dbeafe', text: '#1d4ed8' },
    yellow: { bg: '#fef9c3', text: '#a16207' },
    red:    { bg: '#fee2e2', text: '#b91c1c' },
    gray:   { bg: '#f3f4f6', text: '#374151' },
  }
  const theme = colors[color] ?? { bg: '#f3f4f6', text: '#374151' }
  return (
    <div style={{ padding: getPadding(padding) }}>
      <span style={{
        display: 'inline-block', padding: '0.25rem 0.625rem',
        borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600,
        background: theme.bg, color: theme.text, marginBottom: '0.5rem',
      }}>
        {label}
      </span>
    </div>
  )
}

function Accordion(props: any) {
  const { items, padding } = props as {
    items: Array<{ question: string; answer: string }>; padding: string
  }
  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No accordion items yet — add some in the panel.
      </div>
    )
  }
  return (
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }}>
      {items.map((item, i) => (
        <details key={i} style={{ borderBottom: '1px solid #e5e7eb', padding: '0' }}>
          <summary style={{
            padding: '0.875rem 0', fontWeight: 600, color: '#111827', cursor: 'pointer',
            listStyle: 'none', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', fontSize: '0.9375rem',
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
  const { items, padding } = props as {
    items: Array<{ value: string; label: string }>; padding: string
  }
  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No stats yet — add some in the panel.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.5rem', padding: getPadding(padding) }}>
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
  const { items, padding } = props as {
    items: Array<{ emoji: string; title: string; description: string }>; padding: string
  }
  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        No features yet — add some in the panel.
      </div>
    )
  }
  return (
    <div style={{ marginBottom: '1.5rem', padding: getPadding(padding) }}>
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

function Logos(props: any) {
  const { items, logoHeight, justify, padding } = props as {
    items: Array<{ logoUrl: string; alt: string; href: string }>
    logoHeight: 'sm' | 'md' | 'lg'
    justify: 'left' | 'center' | 'right'
    padding: string
  }
  const heights: Record<string, number> = { sm: 32, md: 48, lg: 64 }
  const heightPx = heights[logoHeight] ?? 48
  const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

  if (!items?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.875rem', padding: getPadding(padding), marginBottom: '1.5rem' }}>
        No logos added yet — add some in the panel.
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '2rem',
      justifyContent: justifyMap[justify] ?? 'center',
      alignItems: 'center',
      padding: getPadding(padding),
      marginBottom: '1.5rem',
    }}>
      {items.map((item, i) => {
        const inner = item.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.logoUrl}
            alt={item.alt ?? ''}
            style={{ height: heightPx, width: 'auto', objectFit: 'contain' }}
          />
        ) : (
          <div style={{
            height: heightPx, width: 120, background: '#f3f4f6', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af', fontSize: '0.75rem',
          }}>
            Logo
          </div>
        )
        return item.href ? (
          <a key={i} href={item.href} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {inner}
          </a>
        ) : (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>{inner}</span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Site blocks
// ---------------------------------------------------------------------------

function SiteLogo(props: any) {
  const {
    logoUrl, siteName,
    logoHeight = 40,
    showTextWithLogo = false,
    textColor,
    homeUrl = '/',
    showIcon = true,
  } = props as {
    logoUrl?: string; siteName?: string; logoHeight?: number;
    showTextWithLogo?: boolean; textColor?: string; homeUrl?: string;
    showIcon?: boolean;
  }
  const href = homeUrl || '/'
  const colorStyle = textColor ? { color: textColor } : undefined
  // Puck select fields return strings; support both boolean and string forms
  const showTextBool = showTextWithLogo === true || (showTextWithLogo as unknown) === 'true'
  const showIconBool = showIcon !== false && (showIcon as unknown) !== 'false'

  if (logoUrl) {
    return (
      <a href={href} className="prickly-logo" style={colorStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={siteName ?? 'Logo'} style={{ height: logoHeight, width: 'auto' }} />
        {showTextBool && siteName && (
          <span style={{ marginLeft: '0.5rem' }}>{siteName}</span>
        )}
      </a>
    )
  }

  return (
    <a href={href} className="prickly-logo" style={colorStyle}>
      {showIconBool && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/cactus.svg" alt="Cactus" style={{ height: 28, width: 28, flexShrink: 0 }} />
      )}
      {siteName ?? 'Site Name'}
    </a>
  )
}

function Copyright(props: any) {
  const {
    siteName,
    prefix = '©',
    customPrefix = '',
    yearFormat = 'current',
    startYear,
    showSiteName = true,
    suffix = '',
    alignment = 'left',
    fontSize = 'small',
    textColor = '#9ca3af',
    privacyPolicyUrl = '',
    privacyPolicyLabel = 'Privacy Policy',
    termsUrl = '',
    termsLabel = 'Terms of Service',
    customLink1Url = '',
    customLink1Label = '',
    customLink2Url = '',
    customLink2Label = '',
  } = props as {
    siteName?: string; prefix?: string; customPrefix?: string;
    yearFormat?: string; startYear?: number; showSiteName?: boolean;
    suffix?: string; alignment?: string; fontSize?: string; textColor?: string;
    privacyPolicyUrl?: string; privacyPolicyLabel?: string;
    termsUrl?: string; termsLabel?: string;
    customLink1Url?: string; customLink1Label?: string;
    customLink2Url?: string; customLink2Label?: string;
  }

  const currentYear = new Date().getFullYear()
  const resolvedPrefix = prefix === 'custom' ? (customPrefix || '©') : prefix === 'none' ? '' : prefix

  let yearText = ''
  if (yearFormat === 'current') yearText = String(currentYear)
  else if (yearFormat === 'range' && startYear) yearText = `${startYear}–${currentYear}`

  const fontSizes: Record<string, string> = { small: '0.875rem', medium: '1rem', large: '1.125rem' }
  const textSize = fontSizes[fontSize] ?? '0.875rem'

  // Puck select fields return strings; support both boolean and string forms
  const showSiteNameBool = showSiteName !== false && (showSiteName as unknown) !== 'false'

  const parts = [
    resolvedPrefix,
    yearText,
    showSiteNameBool ? (siteName ?? 'My Site') : '',
    suffix,
  ].filter(Boolean)
  const copyrightText = parts.join(' ')

  const links = [
    privacyPolicyUrl ? { url: privacyPolicyUrl, label: privacyPolicyLabel || 'Privacy Policy' } : null,
    termsUrl ? { url: termsUrl, label: termsLabel || 'Terms of Service' } : null,
    customLink1Url ? { url: customLink1Url, label: customLink1Label || customLink1Url } : null,
    customLink2Url ? { url: customLink2Url, label: customLink2Label || customLink2Url } : null,
  ].filter(Boolean) as Array<{ url: string; label: string }>

  const justifyContent =
    alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'space-between'

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      justifyContent, gap: '1.5rem', width: '100%',
    }}>
      <span style={{ color: textColor, fontSize: textSize }}>
        {copyrightText}
      </span>
      {links.length > 0 && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {links.map((link) => (
            <a key={link.url} href={link.url} style={{ color: textColor, fontSize: textSize, textDecoration: 'none' }}>
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function MenuBlock(props: any) {
  const {
    resolvedItems, orientation, spacing,
    itemFontSize = 'medium',
    itemFontWeight = 'medium',
    textTransform = 'none',
    itemColor,
    hoverBackground,
  } = props as {
    resolvedItems?: Array<{ id: string; label: string; href: string; openInNewTab: boolean; children?: any[] }>
    orientation: 'horizontal' | 'vertical'
    spacing: 'tight' | 'normal' | 'wide'
    showMobileToggle: string
    itemFontSize?: 'small' | 'medium' | 'large'
    itemFontWeight?: 'normal' | 'medium' | 'semibold' | 'bold'
    textTransform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase'
    itemColor?: string
    hoverBackground?: string
  }

  if (!resolvedItems) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: '#f3f4f6', borderRadius: 6, color: '#9ca3af', fontSize: '0.875rem' }}>
        Menu — configure in editor
      </div>
    )
  }

  const verticalGaps: Record<string, string> = { tight: '0.25rem', normal: '0.5rem', wide: '1rem' }
  const horizontalGaps: Record<string, string> = { tight: '0', normal: '0', wide: '0.5rem' }

  const fontSizeMap: Record<string, string> = { small: '0.8125rem', medium: '0.9375rem', large: '1.0625rem' }
  const fontWeightMap: Record<string, string | number> = { normal: 400, medium: 500, semibold: 600, bold: 700 }

  const linkStyleOverride: React.CSSProperties = {}
  if (itemColor) linkStyleOverride.color = itemColor
  if (itemFontSize !== 'medium') linkStyleOverride.fontSize = fontSizeMap[itemFontSize]
  if (itemFontWeight !== 'medium') linkStyleOverride.fontWeight = fontWeightMap[itemFontWeight]
  if (textTransform !== 'none') linkStyleOverride.textTransform = textTransform as React.CSSProperties['textTransform']

  if (orientation === 'vertical') {
    const vGap = verticalGaps[spacing] ?? '0.5rem'
    return (
      <nav>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: vGap }}>
          {resolvedItems.map((item) => (
            <li key={item.id}>
              <a
                href={item.href}
                target={item.openInNewTab ? '_blank' : undefined}
                rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                className="prickly-menu-link"
                style={linkStyleOverride}
              >
                {item.label}
              </a>
              {item.children && item.children.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0.25rem 0 0', padding: '0 0 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {item.children.map((child: any) => (
                    <li key={child.id}>
                      <a href={child.href} target={child.openInNewTab ? '_blank' : undefined} rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                        className="prickly-dropdown-link" style={itemColor ? { color: itemColor } : undefined}>
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

  const hGap = horizontalGaps[spacing] ?? '0'
  return (
    <ul className="prickly-menu" style={hGap ? { gap: hGap } : undefined}>
      {resolvedItems.map((item) => (
        <li key={item.id} className="prickly-menu-item">
          <a
            href={item.href}
            target={item.openInNewTab ? '_blank' : undefined}
            rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
            className="prickly-menu-link"
            style={{ ...linkStyleOverride, ...(hoverBackground ? { '--prickly-hover-bg': hoverBackground } as React.CSSProperties : {}) }}
          >
            {item.label}
            {item.children && item.children.length > 0 && (
              <span className="prickly-dropdown-arrow" aria-hidden="true">▾</span>
            )}
          </a>
          {item.children && item.children.length > 0 && (
            <ul className="prickly-dropdown" style={{ display: 'none' }}>
              {item.children.map((child: any) => (
                <li key={child.id}>
                  <a href={child.href} target={child.openInNewTab ? '_blank' : undefined}
                    rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                    className="prickly-dropdown-link">
                    {child.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

function LoginButton(props: any) {
  const { isLoggedIn, adminPath, loginLabel, registerLabel } = props as {
    isLoggedIn?: boolean; adminPath?: string; loginLabel: string; registerLabel: string
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
  categories: {
    layout: {
      title: 'Layout',
      components: ['Grid', 'Flex', 'Columns', 'Spacer', 'Divider'],
      defaultExpanded: true,
    },
    typography: {
      title: 'Typography',
      components: ['Heading', 'TextBlock', 'RichTextBlock', 'Quote'],
      defaultExpanded: true,
    },
    actions: {
      title: 'Actions',
      components: ['ButtonLink', 'CTABanner'],
      defaultExpanded: true,
    },
    media: {
      title: 'Media',
      components: ['ImageBlock', 'VideoEmbed', 'Embed'],
      defaultExpanded: true,
    },
    content: {
      title: 'Content',
      components: ['Hero', 'Card', 'Callout', 'Badge', 'Accordion', 'FeatureList', 'Stats', 'Logos'],
      defaultExpanded: true,
    },
    site: {
      title: 'Site',
      components: ['SiteLogo', 'Copyright', 'MenuBlock', 'LoginButton'],
      defaultExpanded: false,
    },
  },
  root: {
    render: ({ children }: { children: React.ReactNode }) => (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
        {children}
      </div>
    ),
  },
  components: {
    // ── Layout ──────────────────────────────────────────────────────────────
    Grid: {
      label: 'Grid',
      fields: {
        columns: {
          type: 'select' as const,
          label: 'Columns',
          options: [
            { value: '2', label: '2 columns' },
            { value: '3', label: '3 columns' },
            { value: '4', label: '4 columns' },
          ],
        },
        gap: {
          type: 'select' as const,
          label: 'Gap',
          options: [
            { value: 'none', label: 'None' },
            { value: 'sm',   label: 'Small' },
            { value: 'md',   label: 'Medium' },
            { value: 'lg',   label: 'Large' },
          ],
        },
        padding: paddingField,
        col1: { type: 'slot' as const },
        col2: { type: 'slot' as const },
        col3: { type: 'slot' as const },
        col4: { type: 'slot' as const },
      },
      defaultProps: {
        columns: '2',
        gap: 'md',
        padding: 'none',
      },
      render: GridBlock,
    },
    Flex: {
      label: 'Flex',
      fields: {
        direction: {
          type: 'select' as const,
          label: 'Direction',
          options: [
            { value: 'row',    label: 'Row (horizontal)' },
            { value: 'column', label: 'Column (vertical)' },
          ],
        },
        justify: {
          type: 'select' as const,
          label: 'Justify content',
          options: [
            { value: 'start',   label: 'Start' },
            { value: 'center',  label: 'Center' },
            { value: 'end',     label: 'End' },
            { value: 'between', label: 'Space between' },
            { value: 'around',  label: 'Space around' },
            { value: 'evenly',  label: 'Space evenly' },
          ],
        },
        align: {
          type: 'select' as const,
          label: 'Align items',
          options: [
            { value: 'start',   label: 'Start' },
            { value: 'center',  label: 'Center' },
            { value: 'end',     label: 'End' },
            { value: 'stretch', label: 'Stretch' },
          ],
        },
        wrap: {
          type: 'select' as const,
          label: 'Wrap',
          options: [
            { value: 'wrap',   label: 'Wrap' },
            { value: 'nowrap', label: 'No wrap' },
          ],
        },
        gap: {
          type: 'select' as const,
          label: 'Gap',
          options: [
            { value: 'none', label: 'None' },
            { value: 'sm',   label: 'Small' },
            { value: 'md',   label: 'Medium' },
            { value: 'lg',   label: 'Large' },
          ],
        },
        padding: paddingField,
        items: { type: 'slot' as const },
      },
      defaultProps: {
        direction: 'row',
        justify: 'start',
        align: 'stretch',
        wrap: 'wrap',
        gap: 'md',
        padding: 'none',
      },
      render: FlexBlock,
    },
    Columns: {
      label: 'Columns',
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
        padding: paddingField,
      },
      defaultProps: {
        ratio: '50/50',
        padding: 'none',
      },
      render: Columns,
    },
    Spacer: {
      label: 'Space',
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
    Divider: {
      label: 'Divider',
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

    // ── Typography ───────────────────────────────────────────────────────────
    Heading: {
      label: 'Heading',
      fields: {
        text:  { type: 'text' as const, label: 'Text' },
        level: {
          type: 'select' as const,
          label: 'Level',
          options: [
            { value: 'h2', label: 'H2 — Section heading' },
            { value: 'h3', label: 'H3 — Sub-heading' },
            { value: 'h4', label: 'H4 — Minor heading' },
            { value: 'h5', label: 'H5 — Small heading' },
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
        padding: paddingField,
      },
      defaultProps: {
        text: 'Section heading',
        level: 'h2' as const,
        align: 'left' as const,
        color: 'dark' as const,
        padding: 'none',
      },
      render: Heading,
    },
    TextBlock: {
      label: 'Text',
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
        padding: paddingField,
      },
      defaultProps: {
        content: 'Enter your text here…',
        align: 'left' as const,
        padding: 'none',
      },
      render: TextBlock,
    },
    RichTextBlock: {
      label: 'Rich Text',
      fields: {
        content: {
          type: 'richtext' as const,
          label: 'Content',
        },
        padding: paddingField,
      },
      defaultProps: {
        content: '',
        padding: 'none',
      },
      render: RichTextBlock,
    },
    Quote: {
      label: 'Quote',
      fields: {
        quote:       { type: 'textarea' as const, label: 'Quote' },
        attribution: { type: 'text' as const,     label: 'Attribution (optional)' },
        padding: paddingField,
      },
      defaultProps: {
        quote: 'Enter a quote here…',
        attribution: '',
        padding: 'none',
      },
      render: Quote,
    },

    // ── Actions ──────────────────────────────────────────────────────────────
    ButtonLink: {
      label: 'Button',
      fields: {
        label:   { type: 'text' as const, label: 'Label' },
        href:    { type: 'text' as const, label: 'URL' },
        variant: {
          type: 'select' as const,
          label: 'Style',
          options: [
            { value: 'primary',   label: 'Primary' },
            { value: 'secondary', label: 'Secondary' },
            { value: 'outline',   label: 'Outline' },
          ],
        },
        padding: paddingField,
      },
      defaultProps: {
        label: 'Click here',
        href: '#',
        variant: 'primary' as const,
        padding: 'none',
      },
      render: ButtonLink,
    },
    CTABanner: {
      label: 'CTA Banner',
      fields: {
        heading:    { type: 'text' as const,     label: 'Heading' },
        subtext:    { type: 'textarea' as const, label: 'Sub-text' },
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
        padding: paddingField,
      },
      defaultProps: {
        heading: 'Ready to get started?',
        subtext: '',
        ctaLabel: 'Get in touch',
        ctaHref: '#',
        background: 'light' as const,
        padding: 'none',
      },
      render: CTABanner,
    },

    // ── Media ────────────────────────────────────────────────────────────────
    ImageBlock: {
      label: 'Image',
      fields: {
        mediaUrl: { type: 'text' as const, label: 'Image URL (set via media picker)' },
        mediaId:  { type: 'text' as const, label: 'Media ID' },
        alt:      { type: 'text' as const, label: 'Alt text' },
        caption:  { type: 'text' as const, label: 'Caption' },
        padding:  paddingField,
      },
      defaultProps: {
        mediaUrl: '',
        mediaId:  '',
        alt:      '',
        caption:  '',
        padding:  'none',
      },
      render: ImageBlock,
    },
    VideoEmbed: {
      label: 'Video',
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
        padding: paddingField,
      },
      defaultProps: {
        url: '',
        title: '',
        aspectRatio: '16:9' as const,
        padding: 'none',
      },
      render: VideoEmbed,
    },
    Embed: {
      label: 'Embed',
      fields: {
        src:    { type: 'text' as const, label: 'URL to embed' },
        height: { type: 'text' as const, label: 'Height (e.g. 400px)' },
        title:  { type: 'text' as const, label: 'Title (for accessibility)' },
        padding: paddingField,
      },
      defaultProps: {
        src: '',
        height: '400px',
        title: '',
        padding: 'none',
      },
      render: Embed,
    },

    // ── Content ──────────────────────────────────────────────────────────────
    Hero: {
      label: 'Hero',
      fields: {
        heading:    { type: 'text' as const,     label: 'Heading' },
        subheading: { type: 'textarea' as const, label: 'Sub-heading' },
        ctaLabel:   { type: 'text' as const,     label: 'CTA label' },
        ctaHref:    { type: 'text' as const,     label: 'CTA URL' },
        padding:    paddingField,
      },
      defaultProps: {
        heading: 'Page heading',
        subheading: '',
        ctaLabel: '',
        ctaHref: '',
        padding: 'none',
      },
      render: Hero,
    },
    Card: {
      label: 'Card',
      fields: {
        mediaUrl: { type: 'text' as const, label: 'Image URL (set via media picker)' },
        mediaId:  { type: 'text' as const, label: 'Media ID' },
        alt:      { type: 'text' as const, label: 'Image alt text' },
        heading:  { type: 'text' as const, label: 'Heading' },
        body:     { type: 'textarea' as const, label: 'Body text' },
        ctaLabel: { type: 'text' as const, label: 'Button label (optional)' },
        ctaHref:  { type: 'text' as const, label: 'Button URL (optional)' },
        padding:  paddingField,
      },
      defaultProps: {
        mediaUrl: '',
        mediaId:  '',
        alt:      '',
        heading:  'Card heading',
        body:     '',
        ctaLabel: '',
        ctaHref:  '',
        padding:  'none',
      },
      render: Card,
    },
    Callout: {
      label: 'Callout',
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
        title:   { type: 'text' as const,     label: 'Title (optional)' },
        body:    { type: 'textarea' as const, label: 'Body' },
        padding: paddingField,
      },
      defaultProps: {
        type: 'info' as const,
        title: '',
        body: 'Notice text here…',
        padding: 'none',
      },
      render: Callout,
    },
    Badge: {
      label: 'Badge',
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
        padding: paddingField,
      },
      defaultProps: {
        label: 'New',
        color: 'green' as const,
        padding: 'none',
      },
      render: Badge,
    },
    Accordion: {
      label: 'Accordion',
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
        padding: paddingField,
      },
      defaultProps: {
        items: [{ question: 'What is the question?', answer: 'This is the answer.' }],
        padding: 'none',
      },
      render: Accordion,
    },
    FeatureList: {
      label: 'Feature List',
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
        padding: paddingField,
      },
      defaultProps: {
        items: [
          { emoji: '✨', title: 'Feature one', description: 'Describe this feature here.' },
          { emoji: '🚀', title: 'Feature two', description: 'Describe this feature here.' },
        ],
        padding: 'none',
      },
      render: FeatureList,
    },
    Stats: {
      label: 'Stats',
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
        padding: paddingField,
      },
      defaultProps: {
        items: [
          { value: '10k+', label: 'Customers' },
          { value: '99%',  label: 'Uptime' },
          { value: '24/7', label: 'Support' },
        ],
        padding: 'none',
      },
      render: Stats,
    },
    Logos: {
      label: 'Logos',
      fields: {
        items: {
          type: 'array' as const,
          label: 'Logos',
          getItemSummary: (item: { alt?: string }) => item.alt || 'Logo',
          arrayFields: {
            logoUrl: { type: 'text' as const, label: 'Logo URL' },
            alt:     { type: 'text' as const, label: 'Alt text' },
            href:    { type: 'text' as const, label: 'Link URL (optional)' },
          },
          defaultItemProps: {
            logoUrl: '',
            alt: 'Company name',
            href: '',
          },
        },
        logoHeight: {
          type: 'select' as const,
          label: 'Logo height',
          options: [
            { value: 'sm', label: 'Small (32px)' },
            { value: 'md', label: 'Medium (48px)' },
            { value: 'lg', label: 'Large (64px)' },
          ],
        },
        justify: {
          type: 'select' as const,
          label: 'Alignment',
          options: [
            { value: 'left',   label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ],
        },
        padding: paddingField,
      },
      defaultProps: {
        items: [
          { logoUrl: '', alt: 'Partner logo', href: '' },
        ],
        logoHeight: 'md' as const,
        justify: 'center' as const,
        padding: 'none',
      },
      render: Logos,
    },

    // ── Site ─────────────────────────────────────────────────────────────────
    SiteLogo: {
      label: 'Site Logo',
      fields: {
        homeUrl: { type: 'text' as const, label: 'Link URL (default: /)' },
        logoHeight: { type: 'number' as const, label: 'Logo image height (px)' },
        showTextWithLogo: {
          type: 'select' as const,
          label: 'Show site name with image',
          options: [
            { value: 'false', label: 'Image only' },
            { value: 'true',  label: 'Image + site name' },
          ],
        },
        showIcon: {
          type: 'select' as const,
          label: 'Show cactus icon (text logo)',
          options: [
            { value: 'true',  label: 'Yes' },
            { value: 'false', label: 'No' },
          ],
        },
        textColor: { type: 'text' as const, label: 'Text colour (hex or CSS value)' },
      },
      defaultProps: {
        homeUrl: '/',
        logoHeight: 40,
        showTextWithLogo: 'false',
        showIcon: 'true',
        textColor: '',
      },
      render: SiteLogo,
    },
    Copyright: {
      label: 'Copyright',
      fields: {
        prefix: {
          type: 'select' as const,
          label: 'Copyright symbol',
          options: [
            { value: '©',         label: '© (copyright symbol)' },
            { value: 'Copyright', label: 'Copyright (word)' },
            { value: 'none',      label: 'None' },
            { value: 'custom',    label: 'Custom…' },
          ],
        },
        customPrefix: { type: 'text' as const, label: 'Custom prefix (when "Custom" selected)' },
        yearFormat: {
          type: 'select' as const,
          label: 'Year format',
          options: [
            { value: 'current', label: 'Current year (auto)' },
            { value: 'range',   label: 'Year range (e.g. 2020–2025)' },
            { value: 'none',    label: 'No year' },
          ],
        },
        startYear: { type: 'number' as const, label: 'Range start year (e.g. 2020)' },
        showSiteName: {
          type: 'select' as const,
          label: 'Show site name',
          options: [
            { value: 'true',  label: 'Yes' },
            { value: 'false', label: 'No' },
          ],
        },
        suffix: { type: 'text' as const, label: 'Suffix text (e.g. All rights reserved.)' },
        alignment: {
          type: 'select' as const,
          label: 'Alignment',
          options: [
            { value: 'left',   label: 'Left (copyright / links split)' },
            { value: 'center', label: 'Center' },
            { value: 'right',  label: 'Right' },
          ],
        },
        fontSize: {
          type: 'select' as const,
          label: 'Font size',
          options: [
            { value: 'small',  label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large',  label: 'Large' },
          ],
        },
        textColor: { type: 'text' as const, label: 'Text colour (hex or CSS value)' },
        privacyPolicyUrl:   { type: 'text' as const, label: 'Privacy Policy URL' },
        privacyPolicyLabel: { type: 'text' as const, label: 'Privacy Policy link label' },
        termsUrl:           { type: 'text' as const, label: 'Terms of Service URL' },
        termsLabel:         { type: 'text' as const, label: 'Terms of Service link label' },
        customLink1Url:   { type: 'text' as const, label: 'Extra link 1 — URL' },
        customLink1Label: { type: 'text' as const, label: 'Extra link 1 — label' },
        customLink2Url:   { type: 'text' as const, label: 'Extra link 2 — URL' },
        customLink2Label: { type: 'text' as const, label: 'Extra link 2 — label' },
      },
      defaultProps: {
        prefix: '©',
        customPrefix: '',
        yearFormat: 'current',
        startYear: new Date().getFullYear(),
        showSiteName: 'true',
        suffix: '',
        alignment: 'left',
        fontSize: 'small',
        textColor: '#9ca3af',
        privacyPolicyUrl: '',
        privacyPolicyLabel: 'Privacy Policy',
        termsUrl: '',
        termsLabel: 'Terms of Service',
        customLink1Url: '',
        customLink1Label: '',
        customLink2Url: '',
        customLink2Label: '',
      },
      render: Copyright,
    },
    MenuBlock: {
      label: 'Menu',
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
        itemFontSize: {
          type: 'select' as const,
          label: 'Font size',
          options: [
            { value: 'small',  label: 'Small' },
            { value: 'medium', label: 'Medium (default)' },
            { value: 'large',  label: 'Large' },
          ],
        },
        itemFontWeight: {
          type: 'select' as const,
          label: 'Font weight',
          options: [
            { value: 'normal',   label: 'Normal' },
            { value: 'medium',   label: 'Medium (default)' },
            { value: 'semibold', label: 'Semibold' },
            { value: 'bold',     label: 'Bold' },
          ],
        },
        textTransform: {
          type: 'select' as const,
          label: 'Text transform',
          options: [
            { value: 'none',       label: 'None (default)' },
            { value: 'uppercase',  label: 'UPPERCASE' },
            { value: 'capitalize', label: 'Capitalize' },
            { value: 'lowercase',  label: 'lowercase' },
          ],
        },
        itemColor: { type: 'text' as const, label: 'Link colour (hex or CSS value)' },
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
        itemFontSize:     'medium' as const,
        itemFontWeight:   'medium' as const,
        textTransform:    'none' as const,
        itemColor:        '',
        showDropdowns:    'hover',
        showMobileToggle: 'collapse',
      },
      render: MenuBlock,
    },
    LoginButton: {
      label: 'Login Button',
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

// Header template config — wraps blocks in the Prickly header shell so the
// Puck-rendered header matches the theme's sticky nav structure.
export const puckHeaderTemplateConfig = {
  ...puckConfig,
  root: {
    render: ({ children }: { children: React.ReactNode }) => (
      <header className="prickly-header">
        <nav className="prickly-nav">
          {children}
        </nav>
      </header>
    ),
  },
}

// Footer template config — wraps blocks in the Prickly footer shell.
export const puckFooterTemplateConfig = {
  ...puckConfig,
  root: {
    render: ({ children }: { children: React.ReactNode }) => (
      <footer className="prickly-footer">
        <div className="prickly-footer-inner">
          {children}
        </div>
      </footer>
    ),
  },
}

// ---------------------------------------------------------------------------
// RSC-safe config variants
// Puck's RSC Render calls React.lazy for any component that has a `richtext`
// field type. React.lazy is not supported in React Server Components and will
// throw, causing a "server error" page. These variants replace the richtext
// field type with textarea so the stored HTML is passed through as-is.
// Use these configs for all public (server-rendered) Render calls.
// ---------------------------------------------------------------------------

const rscSafeComponents = {
  ...puckConfig.components,
  RichTextBlock: {
    ...puckConfig.components.RichTextBlock,
    fields: {
      ...puckConfig.components.RichTextBlock.fields,
      content: { type: 'textarea' as const, label: 'Content (HTML)' },
    },
  },
}

export const puckRscConfig = {
  ...puckConfig,
  components: rscSafeComponents,
}

export const puckHeaderTemplateRscConfig = {
  ...puckHeaderTemplateConfig,
  components: rscSafeComponents,
}

export const puckFooterTemplateRscConfig = {
  ...puckFooterTemplateConfig,
  components: rscSafeComponents,
}

export const puckTemplateRscConfig = {
  ...puckTemplateConfig,
  components: rscSafeComponents,
}
