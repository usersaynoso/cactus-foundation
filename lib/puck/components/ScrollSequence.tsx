'use client'

import { useEffect, useRef, useState } from 'react'

// The shape the sequence worker writes to manifest.json. Everything is optional
// on the wire because a half-written, older or newer manifest must degrade to
// "show the poster" rather than throw - `frames`/`frameCount` are all the scrub
// actually needs, and they are validated before the canvas path turns on.
type Manifest = {
  version?: number
  fps?: number
  width?: number
  height?: number
  frameCount?: number
  hasAlpha?: boolean
  engine?: string
  poster?: string
  frames?: string[]
}

type Props = {
  sequenceUrl?: string
  scrubScreens?: number
  loop?: boolean
  fade?: boolean
  maxWidth?: string
  ariaLabel?: string
  // Optional heading/copy rendered INSIDE the pinned screen, above the canvas.
  // The pinned stage is the whole viewport, so text placed as ordinary blocks
  // before the sequence scrolls away the moment the scrub starts - the only
  // place copy can stay on screen with the animation is inside the stage.
  title?: string
  body?: string
  // Room to leave above the in-screen text for a site's sticky header/nav
  // (any CSS length, e.g. "10rem"). The stage pins at the viewport top and
  // knows nothing about chrome overlaying it, so the page has to say.
  topOffset?: string
  isEditing?: boolean
}

// A manifest stores object KEYS ("media/shop/x/chiro-plus/f_0001.webp"), not
// urls, and every key already starts with "media/". A fetchable url is therefore
// the manifest's own origin plus "/" plus the key.
function frameUrl(origin: string, key: string): string {
  return `${origin}/${key}`
}

// The origin of the manifest url, or '' if it isn't a parseable absolute url.
function originOf(url: string): string {
  try { return new URL(url).origin } catch { return '' }
}

// The poster sits beside the manifest as "poster.webp" (the same convention the
// media picker's thumbnail derives). Worked out rather than read from the
// manifest so there is still something to show when the manifest fetch fails.
function fallbackPosterUrl(url: string): string {
  return (url.split('?')[0] ?? url).replace(/[^/]*$/, 'poster.webp')
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

const BADGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '0.5rem',
  left: '0.5rem',
  background: 'var(--color-surface)',
  color: 'var(--color-text-muted)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  padding: '0.125rem 0.5rem',
  fontSize: '0.75rem',
  pointerEvents: 'none',
}

export default function ScrollSequence({
  sequenceUrl,
  scrubScreens = 2,
  loop = true,
  fade = true,
  maxWidth = '',
  ariaLabel,
  title = '',
  body = '',
  topOffset = '',
  isEditing,
}: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [posterFailed, setPosterFailed] = useState(false)

  const spacerRef = useRef<HTMLDivElement>(null)
  const fadeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const framesRef = useRef<HTMLImageElement[]>([])
  const lastDrawnRef = useRef<number | null>(null)

  const label = ariaLabel || 'Product animation'
  const cap = maxWidth.trim() || '100%'
  const hasText = !!(title.trim() || body.trim())
  const pad = topOffset.trim()

  // The in-screen heading/copy block, shared by the editor preview and the
  // published stage so both paths keep identical markup.
  const textBlock = hasText ? (
    <div style={{ width: '100%', maxWidth: cap, margin: '0 auto', boxSizing: 'border-box' }}>
      {title.trim() && <h2 style={{ margin: '0 0 0.5rem' }}>{title}</h2>}
      {body.trim() && <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>{body}</p>}
    </div>
  ) : null

  // Fetch the manifest once per url. It is tiny, so it loads on mount even when
  // the block is far down the page; the heavy frame preload is what waits for the
  // viewport (see the canvas effect below).
  useEffect(() => {
    if (!sequenceUrl) return
    let cancelled = false
    // Reset to a clean loading state whenever the chosen sequence changes. This
    // runs once per url (see deps below), not in a render loop, so the
    // set-state-in-effect warning is a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading'); setManifest(null); setPosterFailed(false)
    fetch(sequenceUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((m: Manifest) => {
        if (cancelled) return
        if (!m || !Array.isArray(m.frames) || m.frames.length === 0) { setStatus('error'); return }
        setManifest(m)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [sequenceUrl])

  // The player itself: preload, scrub, loop and fade. Only wired on the published
  // path (never in the editor, where scrolljacking fights the Puck canvas) and
  // only once the manifest has validated.
  useEffect(() => {
    if (isEditing) return
    if (status !== 'ready' || !manifest || !sequenceUrl) return
    const canvas = canvasRef.current
    const spacer = spacerRef.current
    if (!canvas || !spacer) return
    const origin = originOf(sequenceUrl)
    if (!origin) return

    const frames = manifest.frames as string[]
    const frameCount = frames.length
    const fps = manifest.fps && manifest.fps > 0 ? manifest.fps : 30
    const w = manifest.width && manifest.width > 0 ? manifest.width : 1280
    const h = manifest.height && manifest.height > 0 ? manifest.height : 720
    // Cap the pixel-ratio multiplier: a 3x phone would triple the buffer memory
    // for a difference no one can see on a scrubbed animation.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    lastDrawnRef.current = null
    framesRef.current = []

    // Frames are alpha WebP, so every draw clears first - otherwise transparent
    // pixels would let the previous frame show through and the canvas would smear.
    function drawImageEl(img: HTMLImageElement) {
      if (!ctx) return
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    // The frame at `index` if it has loaded, else the nearest earlier loaded
    // frame, so a fast scrub before preload finishes still shows something close
    // rather than a blank canvas.
    function readyFrameAt(index: number): HTMLImageElement | null {
      const list = framesRef.current
      const target = list[index]
      if (target && target.complete && target.naturalWidth > 0) return target
      for (let i = index - 1; i >= 0; i--) {
        const f = list[i]
        if (f && f.complete && f.naturalWidth > 0) return f
      }
      return null
    }
    function drawFrame(index: number) {
      const img = readyFrameAt(index)
      if (!img) return // nothing loaded yet - leave the poster/last frame up
      drawImageEl(img)
      lastDrawnRef.current = index
    }

    // Poster first, so the stage is never blank when it scrolls into view.
    const poster = new Image()
    poster.decoding = 'async'
    poster.onload = () => { if (lastDrawnRef.current == null) drawImageEl(poster) }
    poster.src = manifest.poster ? frameUrl(origin, manifest.poster) : fallbackPosterUrl(sequenceUrl)

    // Deferred until near the viewport: a page with this block far down should not
    // pull the whole (~MBs) frame folder up front.
    let preloaded = false
    function preload() {
      if (preloaded) return
      preloaded = true
      framesRef.current = frames.map((key) => {
        const img = new Image()
        img.decoding = 'async'
        img.src = frameUrl(origin, key)
        return img
      })
    }

    // Loop: once the scrub has reached the last frame, advance frames on a timer
    // at the manifest fps until the user scrubs back or the block leaves view.
    let loopRaf = 0
    let loopLast = 0
    let loopIdx = 0
    function loopTick(now: number) {
      if (!loopLast) loopLast = now
      if (now - loopLast >= 1000 / fps) {
        loopLast = now
        loopIdx = (loopIdx + 1) % frameCount
        drawFrame(loopIdx)
      }
      loopRaf = requestAnimationFrame(loopTick)
    }
    function startLoop() {
      if (loopRaf) return
      loopIdx = frameCount - 1
      loopLast = 0
      loopRaf = requestAnimationFrame(loopTick)
    }
    function stopLoop() {
      if (loopRaf) { cancelAnimationFrame(loopRaf); loopRaf = 0 }
    }

    // Scrub: map scroll progress through the spacer (0 at its top, 1 once its
    // bottom reaches the viewport bottom) to a frame index. rAF-throttled.
    let scrollRaf = 0
    function update() {
      scrollRaf = 0
      const s = spacerRef.current
      if (!s) return
      const rect = s.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0
      const idx = Math.round(p * (frameCount - 1))
      if (loop && idx >= frameCount - 1) {
        startLoop()
      } else {
        stopLoop()
        drawFrame(idx)
      }
    }
    function onScroll() {
      if (scrollRaf) return
      scrollRaf = requestAnimationFrame(update)
    }

    // Near-viewport gate. Starts the preload, wires passive scroll/resize and
    // draws once; when the block leaves (plus a margin) it tears the listeners
    // and any loop down again for battery/CPU.
    let listening = false
    const activity = new IntersectionObserver((entries) => {
      const near = !!entries[0]?.isIntersecting
      if (near && !listening) {
        listening = true
        preload()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        update()
      } else if (!near && listening) {
        listening = false
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('resize', onScroll)
        stopLoop()
      }
    }, { rootMargin: '300px 0px' })
    activity.observe(spacer)

    // Fade: opacity tracks how much of the stage is on screen, so it fades in on
    // entry and out on exit, fully out at 0. Only wired when the option is on.
    let fadeObs: IntersectionObserver | null = null
    const fadeEl = fadeRef.current
    if (fade && fadeEl) {
      fadeObs = new IntersectionObserver((entries) => {
        const e = entries[0]
        const ratio = e && e.isIntersecting ? e.intersectionRatio : 0
        fadeEl.style.opacity = String(ratio)
      }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) })
      fadeObs.observe(fadeEl)
    }

    return () => {
      activity.disconnect()
      fadeObs?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      stopLoop()
      if (scrollRaf) cancelAnimationFrame(scrollRaf)
      poster.onload = null
      framesRef.current = []
      lastDrawnRef.current = null
    }
  }, [manifest, status, sequenceUrl, loop, fade, isEditing])

  // Nothing picked yet: a neutral placeholder, mirroring the Image block's own
  // "nothing chosen" affordance.
  if (!sequenceUrl) {
    return <div style={PLACEHOLDER_STYLE}>Pick a scroll sequence in the panel</div>
  }

  const posterUrl = manifest?.poster
    ? frameUrl(originOf(sequenceUrl), manifest.poster)
    : fallbackPosterUrl(sequenceUrl)

  // Editor: never pin or scrolljack (it breaks the Puck builder). Show a
  // representative still with a small badge so it reads as a builder preview.
  if (isEditing) {
    return (
      <div style={{ maxWidth: cap, margin: '0 auto' }}>
        {textBlock}
        <div style={{ position: 'relative' }}>
          {posterFailed ? (
            <div style={PLACEHOLDER_STYLE}>Scroll sequence (preview unavailable)</div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={posterUrl}
                alt={label}
                onError={() => setPosterFailed(true)}
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
              <span style={BADGE_STYLE}>Scroll sequence</span>
            </>
          )}
        </div>
      </div>
    )
  }

  // Published, but the manifest failed: the poster if it loads, else a small
  // message. No tall spacer - there are no frames to scrub. Any in-screen copy
  // still renders: the words should not vanish with the animation.
  if (status === 'error') {
    return (
      <div style={{ maxWidth: cap, margin: '0 auto' }}>
        {textBlock}
        {posterFailed ? (
          <div style={PLACEHOLDER_STYLE}>Animation unavailable</div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={posterUrl}
            alt={label}
            onError={() => setPosterFailed(true)}
            style={{ display: 'block', width: '100%', height: 'auto' }}
          />
        )}
      </div>
    )
  }

  // Published, loading or ready. The spacer's height depends only on scrubScreens,
  // so it renders straight away; the canvas fills in once the manifest is ready.
  // The canvas stays transparent (alpha frames), so it sits on any page
  // background and works in light and dark alike.
  const w = manifest?.width && manifest.width > 0 ? manifest.width : undefined
  const h = manifest?.height && manifest.height > 0 ? manifest.height : undefined
  const stage = status === 'ready' ? (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      style={hasText
        // Sharing the screen with the text: cap by the leftover height as well
        // as the width so text + canvas always fit the viewport together.
        ? { display: 'block', maxWidth: cap, maxHeight: '100%', width: 'auto', height: 'auto', aspectRatio: w && h ? `${w} / ${h}` : undefined }
        : { display: 'block', width: '100%', maxWidth: cap, height: 'auto', margin: '0 auto', aspectRatio: w && h ? `${w} / ${h}` : undefined }}
    />
  ) : posterFailed ? null : (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={posterUrl}
      alt={label}
      onError={() => setPosterFailed(true)}
      style={hasText
        ? { display: 'block', maxWidth: cap, maxHeight: '100%', width: 'auto', height: 'auto' }
        : { display: 'block', width: '100%', maxWidth: cap, height: 'auto', margin: '0 auto' }}
    />
  )
  return (
    <div
      ref={spacerRef}
      style={{ position: 'relative', height: `${(1 + Math.max(0, scrubScreens)) * 100}vh` }}
    >
      <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {hasText ? (
          // Text shares the pinned screen: copy at the top (below any declared
          // sticky-chrome clearance), canvas centred in whatever height is left.
          <div
            ref={fadeRef}
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: pad ? 'flex-start' : 'center', gap: '0.75rem', paddingTop: pad || undefined, paddingBottom: '1rem', boxSizing: 'border-box', opacity: fade ? 0 : 1, transition: 'opacity 0.3s ease' }}
          >
            {textBlock}
            <div style={{ flex: '1 1 auto', minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {stage}
            </div>
          </div>
        ) : (
          <div
            ref={fadeRef}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', opacity: fade ? 0 : 1, transition: 'opacity 0.3s ease' }}
          >
            {stage}
          </div>
        )}
      </div>
    </div>
  )
}
