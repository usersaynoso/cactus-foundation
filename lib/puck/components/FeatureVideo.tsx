'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { mobileMediaQuery } from '@/lib/puck/responsiveValue'

type Props = {
  videoUrl?: string
  posterUrl?: string
  maxWidth?: string
  // Corner radius of the video. Defaults to the shop's product image stage
  // (16px) so a feature video sits in the same visual family as the gallery.
  radius?: string
  // Frame the video the way the product image stage is framed: a hairline
  // border and a subtle background behind it. Studio clips are shot on white,
  // so on a dark page the frame is what stops the clip reading as a stray
  // white rectangle.
  frame?: boolean
  loop?: boolean
  controls?: boolean
  title?: string
  body?: string
  // Where the copy sits relative to the video on wide screens: stacked above
  // it (default), or beside it on either side. Beside always collapses back to
  // stacked below the site's mobile breakpoint, where two columns have no room.
  textSide?: 'above' | 'left' | 'right'
  ariaLabel?: string
  isEditing?: boolean
}

// Neutral chrome - tokens only, legible on either theme, and transparent enough
// to sit on any page background.
const PLACEHOLDER_STYLE: React.CSSProperties = {
  background: 'var(--color-bg-subtle)',
  borderRadius: 6,
  padding: '3rem',
  textAlign: 'center',
  color: 'var(--color-muted)',
  fontSize: '0.875rem',
}

export default function FeatureVideo({
  videoUrl,
  posterUrl = '',
  maxWidth = '',
  radius = '16px',
  frame = true,
  loop = true,
  controls = false,
  title = '',
  body = '',
  textSide = 'above',
  ariaLabel,
  isEditing,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  const label = ariaLabel || title || 'Product video'
  const cap = maxWidth.trim() || '100%'
  const hasText = !!(title.trim() || body.trim())
  // Two tracks need a media query to collapse on phones - hence a scoped id.
  // useId keeps editor and RSC markup identical, which the parity rule requires.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const beside = hasText && (textSide === 'left' || textSide === 'right')

  // Play only what is on screen. Product pages carry several of these and the
  // clips are a few megabytes each, so nothing is fetched until the section is
  // nearly in view, and playback stops again the moment it leaves.
  useEffect(() => {
    if (isEditing) return
    const el = videoRef.current
    if (!el || !videoUrl) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    // Near the viewport: start fetching. Actually on screen: play.
    const preloader = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      if (el.preload !== 'auto') { el.preload = 'auto'; el.load() }
      preloader.disconnect()
    }, { rootMargin: '400px 0px' })

    const player = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        if (!reduced) el.play().catch(() => {})
      } else if (!el.paused) {
        el.pause()
      }
    }, { threshold: 0.25 })

    preloader.observe(el)
    player.observe(el)
    return () => { preloader.disconnect(); player.disconnect() }
  }, [videoUrl, isEditing])

  // Nothing picked yet: a neutral placeholder, mirroring the Image block's own
  // "nothing chosen" affordance.
  if (!videoUrl) {
    return <div style={PLACEHOLDER_STYLE}>Pick a video in the panel</div>
  }

  // The heading/copy block, shared by the editor preview and the published
  // path so both keep identical markup. Stacked above the video it is centred
  // and capped to the video's width; beside it, it fills its own track and the
  // cap would only starve it.
  const textBlock = hasText ? (
    <div style={beside
      ? { width: '100%', boxSizing: 'border-box' }
      : { width: '100%', maxWidth: cap, margin: '0 auto', boxSizing: 'border-box' }}>
      {title.trim() && <h2 style={{ margin: '0 0 0.5rem' }}>{title}</h2>}
      {body.trim() && <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{body}</p>}
    </div>
  ) : null

  const rad = radius.trim() || '0'
  const media = failed ? (
    <div style={PLACEHOLDER_STYLE}>Video unavailable</div>
  ) : (
    <video
      ref={videoRef}
      src={videoUrl}
      poster={posterUrl.trim() || undefined}
      aria-label={label}
      // Muted + inline is what lets a browser autoplay at all; the clips are
      // silent product loops, so there is no sound to lose.
      muted
      playsInline
      loop={loop}
      controls={controls}
      preload="none"
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: `min(${cap}, 100%)`,
        height: 'auto',
        margin: beside ? undefined : '0 auto',
        borderRadius: rad,
        // Safari still paints video pixels outside a rounded box without this.
        overflow: 'hidden',
        border: frame ? '1px solid var(--color-border)' : undefined,
        background: frame ? 'var(--color-bg-subtle)' : undefined,
      }}
    />
  )

  if (!beside) {
    return (
      <div style={{ maxWidth: cap, margin: '0 auto' }}>
        {textBlock}
        {media}
      </div>
    )
  }

  // Beside-the-video layout. Explicit track placement (rather than DOM order)
  // puts the copy on the requested side, so the DOM can stay copy-first and
  // collapse to copy-above-video on a phone simply by dropping to one column.
  // Both cells are pinned to row 1: grid auto-placement never moves backwards,
  // so with the copy on the RIGHT the video would otherwise be bumped onto a
  // second row and sit under the copy.
  const textCol = textSide === 'left' ? 1 : 2
  const mediaCol = textSide === 'left' ? 2 : 1
  const sideCss = `${mobileMediaQuery()}{[data-fv-split="${uid}"]{grid-template-columns:1fr !important;grid-template-rows:auto auto !important;gap:0.75rem !important;align-items:start !important;}`
    + `[data-fv-split="${uid}"]>*{grid-column:auto !important;grid-row:auto !important;}}`

  return (
    <>
      <style>{sideCss}</style>
      <div data-fv-split={uid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: '2rem' }}>
        <div style={{ gridColumn: textCol, gridRow: 1, minWidth: 0 }}>{textBlock}</div>
        <div style={{ gridColumn: mediaCol, gridRow: 1, minWidth: 0 }}>{media}</div>
      </div>
    </>
  )
}
