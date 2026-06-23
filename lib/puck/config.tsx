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
  },
} satisfies Config

export default puckConfig
export type PuckConfig = typeof puckConfig
