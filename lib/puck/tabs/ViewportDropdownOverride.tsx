import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createUsePuck } from '@puckeditor/core'
import type { Viewports } from '@puckeditor/core'

const usePuck = createUsePuck()

function ChevronDown() {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ViewportDropdown({ viewports }: { viewports: Viewports }) {
  const appState = usePuck(s => s.appState)
  const dispatch = usePuck(s => s.dispatch)
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const current = appState.ui.viewports.current

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The track this trigger sits in (`_ViewportControls-actionsInner_`) has `overflow: hidden`
  // in Puck's own CSS, clipping any absolutely-positioned child regardless of z-index - so the
  // panel is portaled to document.body instead and positioned from the trigger's live rect.
  useEffect(() => {
    if (!open || !wrapRef.current) return
    const reposition = () => {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      setPanelPos({ top: rect.bottom + 4, left: rect.left })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  const activeIndex = viewports.findIndex(v => v.width === current.width)
  const active = viewports[activeIndex] ?? viewports[0]

  const select = (viewport: Viewports[number]) => {
    dispatch({
      type: 'setUi',
      ui: {
        viewports: {
          ...appState.ui.viewports,
          current: { width: viewport.width, height: viewport.height || 'auto' },
        },
      },
      recordHistory: false,
    })
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="cactus-viewport-dropdown">
      <button
        type="button"
        className="cactus-viewport-dropdown-trigger"
        title={active?.label ? `Switch viewport (currently ${active.label})` : 'Switch viewport'}
        onClick={() => setOpen(o => !o)}
      >
        {typeof active?.icon === 'string' ? active.label : active?.icon}
        <ChevronDown />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="cactus-viewport-dropdown-panel"
          role="listbox"
          style={{ position: 'fixed', top: panelPos.top, left: panelPos.left }}
        >
          {viewports.map((v, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className="cactus-viewport-dropdown-option"
              data-active={i === activeIndex || undefined}
              title={v.label ? `Switch to ${v.label} viewport` : 'Switch viewport'}
              onClick={() => select(v)}
            >
              <span className="cactus-viewport-dropdown-option-icon">
                {typeof v.icon === 'string' ? v.label : v.icon}
              </span>
              <span className="cactus-viewport-dropdown-option-label">{v.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function SunIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

// A toolbar toggle that flips only the preview canvas between light and dark mode - it
// sets `data-theme` on the canvas iframe's <html>, the same attribute the live site reads
// (see lib/design/tokens.ts). Nothing is persisted and the admin chrome is untouched; the
// initial state is seeded from the OS scheme so it matches what the iframe already shows
// (the iframe carries no data-theme of its own, so it follows prefers-color-scheme).
function ThemePreviewToggle() {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null
    if (!frame) return
    const apply = () => {
      const html = frame.contentDocument?.documentElement
      if (html) html.setAttribute('data-theme', dark ? 'dark' : 'light')
    }
    apply()
    // Safety net for the rare case the iframe reloads after mount.
    frame.addEventListener('load', apply)
    return () => frame.removeEventListener('load', apply)
  }, [dark])

  return (
    <button
      type="button"
      className="cactus-theme-preview-toggle"
      data-active={dark || undefined}
      title={dark ? 'Previewing dark mode - click for light' : 'Preview in dark mode'}
      onClick={() => setDark(d => !d)}
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

function ShrinkPreviewIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" /><path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

// Header layouts only: a toggle to preview the "shrink on scroll" state without
// having to actually scroll the canvas (which is usually too short to trigger it).
// No new Puck field/data - it reaches straight into the canvas iframe's DOM and
// flips the same data-shrunk attribute HeaderShrinkScroll toggles on real scroll,
// so nothing is persisted and the live site is untouched.
function ShrinkPreviewToggle() {
  const rootProps = usePuck(s => (s.appState.data.root.props as { shrinkOnScroll?: string }) ?? {})
  const [previewing, setPreviewing] = useState(false)

  const shrinkEnabled = rootProps.shrinkOnScroll === 'yes'

  useEffect(() => {
    const frame = document.getElementById('preview-frame') as HTMLIFrameElement | null
    const header = frame?.contentDocument?.querySelector('header[data-shrink-root]')
    header?.toggleAttribute('data-shrunk', shrinkEnabled && previewing)
    // Cleanup covers both unmount (leaving the header layout) and shrink being
    // turned off - either way the canvas iframe shouldn't stay stuck mid-shrink.
    return () => { header?.removeAttribute('data-shrunk') }
  }, [previewing, shrinkEnabled])

  if (!shrinkEnabled) return null

  return (
    <button
      type="button"
      className="cactus-shrink-preview-toggle"
      data-active={previewing || undefined}
      title={previewing ? 'Showing shrunk header - click to show full size' : 'Preview shrunk header'}
      onClick={() => setPreviewing(p => !p)}
    >
      <ShrinkPreviewIcon />
    </button>
  )
}

// Puck's viewports prop only renders a flat row of icon buttons - no dropdown mode - so this
// hides that row entirely (sidebarOverrides.css) and portals a custom dropdown into the same
// toolbar slot instead. Reuses Puck's own public setUi dispatch action (the same one its
// internal ViewportControls fires), not a private/internal API.
export function createViewportDropdownOverride(viewports: Viewports, options: { shrinkPreview?: boolean } = {}) {
  return function ViewportDropdownOverride({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)
    const [mount, setMount] = useState<HTMLElement | null>(null)
    const [themeMount, setThemeMount] = useState<HTMLElement | null>(null)
    const [shrinkMount, setShrinkMount] = useState<HTMLElement | null>(null)

    useEffect(() => {
      if (!ref.current) return
      let frame = 0

      const tryFind = () => {
        if (!ref.current) return
        const track = ref.current.querySelector('[class*="_ViewportControls-actionsInner_"]') as HTMLElement | null
        if (!track) { frame = requestAnimationFrame(tryFind); return }
        if (!track.querySelector('.cactus-viewport-dropdown-mount')) {
          const el = document.createElement('div')
          el.className = 'cactus-viewport-dropdown-mount'
          track.insertBefore(el, track.firstChild)
          setMount(el)
        }
        // Light/dark preview toggle - sits just before Puck's zoom select. Anchoring to the
        // zoom select (not track order) keeps it "next to" the zoom box wherever Puck puts it.
        if (!track.querySelector('.cactus-theme-preview-mount')) {
          const el = document.createElement('div')
          el.className = 'cactus-theme-preview-mount'
          const zoom = track.querySelector('[class*="_ViewportControls-zoomSelect_"]')
          if (zoom) track.insertBefore(el, zoom)
          else track.appendChild(el)
          setThemeMount(el)
        }
        if (options.shrinkPreview && !track.querySelector('.cactus-shrink-preview-mount')) {
          const el = document.createElement('div')
          el.className = 'cactus-shrink-preview-mount'
          track.appendChild(el)
          setShrinkMount(el)
        }
        observer.disconnect()
      }

      const observer = new MutationObserver(tryFind)
      observer.observe(ref.current, { childList: true, subtree: true })
      tryFind()

      return () => {
        observer.disconnect()
        cancelAnimationFrame(frame)
      }
    }, [])

    return (
      <div ref={ref} style={{ display: 'contents' }}>
        {children}
        {mount && createPortal(<ViewportDropdown viewports={viewports} />, mount)}
        {themeMount && createPortal(<ThemePreviewToggle />, themeMount)}
        {shrinkMount && createPortal(<ShrinkPreviewToggle />, shrinkMount)}
      </div>
    )
  }
}
