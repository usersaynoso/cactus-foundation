'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// Shrinks whatever it wraps so it always fits its column's width. Opt-in per
// grid column (the "Scale to width" field). Unlike a fixed width, a transform
// scale works on ANY content - fixed-size icon buttons (theme toggle), a cart
// widget, an image, arbitrary blocks - because a transform doesn't touch the
// element's own layout, so we can read its natural (unscaled) size and scale
// the whole thing down to fit.
//
// Scale is min(1, columnWidth / naturalWidth): it only ever shrinks, never
// enlarges, so a column wider than its content behaves exactly as before. The
// outer box height is set to the scaled height so a shrunk element doesn't
// leave a gap of its original height below it. transform-origin follows the
// column's alignment so a right-aligned cluster shrinks in place against the
// right edge (matching the header actions column) rather than drifting.
export default function ScaleToFit({
  align = 'start',
  children,
}: {
  align?: 'start' | 'center' | 'end'
  children: React.ReactNode
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [boxHeight, setBoxHeight] = useState<number | undefined>(undefined)

  const measure = useCallback(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    // scrollWidth/Height report the layout box, which a CSS transform never
    // affects - so this is the true unscaled natural size regardless of the
    // scale already applied.
    const available = outer.clientWidth
    const naturalWidth = inner.scrollWidth
    const naturalHeight = inner.scrollHeight
    const next = naturalWidth > 0 ? Math.min(1, available / naturalWidth) : 1
    setScale(next)
    setBoxHeight(naturalHeight * next)
  }, [])

  useEffect(() => {
    measure()
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(outer)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [measure])

  const originX = align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'
  const justify = align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'

  return (
    <div
      ref={outerRef}
      style={{ width: '100%', display: 'flex', justifyContent: justify, height: boxHeight, overflow: 'hidden' }}
    >
      <div
        ref={innerRef}
        style={{ flex: '0 0 auto', transform: `scale(${scale})`, transformOrigin: `${originX} top` }}
      >
        {children}
      </div>
    </div>
  )
}
