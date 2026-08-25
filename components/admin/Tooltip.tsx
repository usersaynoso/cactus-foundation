'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The admin's own tooltip, as a component.
//
// Native `title=` was doing this job in most of the admin, and doing it badly:
// it waits a second or so before appearing, it cannot be styled, it never shows
// on keyboard focus, and on a long sentence the browser renders it in whatever
// system font it fancies. Where a tooltip is carrying real information - which
// of three pictures a box is holding, say - that is not good enough.
//
// Visuals match .theme-toggle-tip and .admin-nav-tip, which is the house look.
// Portalled to <body> and fixed-positioned, so it escapes any scroll container
// or `overflow: hidden` between it and the page, and shown at once on hover or
// focus rather than after the native delay.

type Placement = 'top' | 'bottom'

// Kept off the very edge of the window, and off the trigger itself.
const GAP = 8
const EDGE = 8

export function AdminTooltip({
  title,
  body,
  children,
  placement = 'top',
  maxWidth = 300,
  disabled = false,
  className,
  style,
}: {
  // The bold first line. Optional: a one-line tip needs no heading.
  title?: string
  // The rest of it. Wraps, unlike the one-line tips elsewhere in the admin.
  body?: ReactNode
  children: ReactNode
  // Preferred side. Flips to the other one when there is no room.
  placement?: Placement
  maxWidth?: number
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const id = useId()
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const place = useCallback(() => {
    const anchor = anchorRef.current
    const tip = tipRef.current
    if (!anchor || !tip) return
    const a = anchor.getBoundingClientRect()
    const t = tip.getBoundingClientRect()

    // Above by preference, below when the tip would run off the top of the
    // window - which it does often, these boxes sitting in a table's first rows.
    const wantsTop = placement === 'top'
    const roomAbove = a.top - GAP - t.height >= EDGE
    const roomBelow = a.bottom + GAP + t.height <= window.innerHeight - EDGE
    const onTop = wantsTop ? roomAbove || !roomBelow : !(roomBelow || !roomAbove)
    const top = onTop ? a.top - GAP - t.height : a.bottom + GAP

    // Centred on the trigger, then pulled back inside the window rather than
    // being allowed to hang off the right-hand edge of a wide table.
    const centred = a.left + a.width / 2 - t.width / 2
    const left = Math.max(EDGE, Math.min(centred, window.innerWidth - t.width - EDGE))
    setPos({ top, left })
  }, [placement])

  // Placed after the tip is in the DOM, because placing it needs its measured
  // size. A plain effect rather than a layout one: this component is server-
  // rendered like any other client component, and useLayoutEffect warns there.
  // Nothing flashes at 0,0 meanwhile - the tip is `visibility: hidden` until
  // `pos` is set, one frame later.
  useEffect(() => {
    if (!open) return
    place()
    const onScrollOrResize = () => place()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, place])

  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => { setOpen(false); setPos(null) }, [])

  const showing = open && !disabled && (title || body)

  return (
    <span
      ref={anchorRef}
      className={className}
      style={{ display: 'inline-flex', ...style }}
      // Focus rides along with hover: a swatch box is reachable by keyboard, and
      // a tooltip only the mouse can summon is a tooltip half the users never see.
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={showing ? id : undefined}
    >
      {children}
      {showing && typeof document !== 'undefined' && createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          className="admin-tip"
          style={{
            maxWidth,
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            // Hidden until measured, so nothing is drawn in the wrong place.
            // The effect above fills `pos` immediately after this first paint.
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {title && <span className="admin-tip-title">{title}</span>}
          {body && <span className="admin-tip-body">{body}</span>}
        </div>,
        document.body
      )}
    </span>
  )
}
