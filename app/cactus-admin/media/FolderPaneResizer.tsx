'use client'

import { useCallback, useRef, useState } from 'react'

/**
 * The draggable divider between the folder tree and the grid. It sits in its own
 * grid column so the handle is the full height of the row rather than only as
 * tall as the tree, which on a two-folder library would be a couple of pixels.
 *
 * Pointer events (not mouse events) so a trackpad, a pen and a touch screen all
 * work, with pointer capture so the drag survives the cursor leaving the strip.
 */
export default function FolderPaneResizer({
  width,
  min,
  max,
  defaultWidth,
  onWidth,
}: {
  width: number
  min: number
  max: number
  defaultWidth: number
  onWidth: (next: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState(false)
  const start = useRef<{ x: number; width: number } | null>(null)

  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n))), [min, max])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    start.current = { x: e.clientX, width }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    onWidth(clamp(start.current.width + (e.clientX - start.current.x)))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    start.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16
    if (e.key === 'ArrowLeft') { onWidth(clamp(width - step)); e.preventDefault() }
    else if (e.key === 'ArrowRight') { onWidth(clamp(width + step)); e.preventDefault() }
    else if (e.key === 'Home') { onWidth(min); e.preventDefault() }
    else if (e.key === 'End') { onWidth(max); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === ' ') { onWidth(defaultWidth); e.preventDefault() }
  }

  const lit = dragging || hover

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize folder pane"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={() => onWidth(defaultWidth)}
      title="Drag to resize, double-click to reset"
      style={{
        alignSelf: 'stretch',
        display: 'flex',
        justifyContent: 'center',
        cursor: 'col-resize',
        touchAction: 'none',
        // The strip is wider than the line it draws so it stays easy to grab.
        background: 'transparent',
        borderRadius: 'var(--radius-sm)',
        outlineOffset: '2px',
      }}
    >
      <div
        aria-hidden
        style={{
          width: lit ? '3px' : '1px',
          minHeight: '2rem',
          borderRadius: '2px',
          background: lit ? 'var(--color-primary)' : 'var(--color-border)',
          transition: 'background 120ms ease, width 120ms ease',
        }}
      />
    </div>
  )
}
