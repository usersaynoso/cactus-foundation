import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePuck } from '@puckeditor/core'
import type { Viewports } from '@puckeditor/core'

function ChevronDown() {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ViewportDropdown({ viewports }: { viewports: Viewports }) {
  const { appState, dispatch } = usePuck()
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

// Puck's viewports prop only renders a flat row of icon buttons - no dropdown mode - so this
// hides that row entirely (sidebarOverrides.css) and portals a custom dropdown into the same
// toolbar slot instead. Reuses Puck's own public setUi dispatch action (the same one its
// internal ViewportControls fires), not a private/internal API.
export function createViewportDropdownOverride(viewports: Viewports) {
  return function ViewportDropdownOverride({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null)
    const [mount, setMount] = useState<HTMLElement | null>(null)

    useEffect(() => {
      if (!ref.current) return
      let frame = 0

      const tryFind = () => {
        if (!ref.current) return
        const track = ref.current.querySelector('[class*="_ViewportControls-actionsInner_"]') as HTMLElement | null
        if (!track) { frame = requestAnimationFrame(tryFind); return }
        if (track.querySelector('.cactus-viewport-dropdown-mount')) {
          observer.disconnect()
          return
        }
        const el = document.createElement('div')
        el.className = 'cactus-viewport-dropdown-mount'
        track.insertBefore(el, track.firstChild)
        setMount(el)
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
      </div>
    )
  }
}
