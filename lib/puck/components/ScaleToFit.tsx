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
    const available = outer.clientWidth
    // scrollWidth only reports true overflow extent on a scroll container -
    // on a plain overflow:visible box (inner, here) it silently ignores
    // absolutely-positioned descendants that poke out past it (e.g. a cart
    // icon's notification badge at right:-10px), undercounting the natural
    // size. Union the bounding rects of every descendant instead - measured
    // with the transform stripped so a previously-applied scale doesn't
    // shrink the numbers we're about to compute the next scale from.
    const prevTransform = inner.style.transform
    inner.style.transform = 'none'
    const innerRect = inner.getBoundingClientRect()
    let right = innerRect.right
    let bottom = innerRect.bottom
    inner.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > right) right = r.right
      if (r.bottom > bottom) bottom = r.bottom
    })
    inner.style.transform = prevTransform
    const naturalWidth = right - innerRect.left
    const naturalHeight = bottom - innerRect.top
    const next = naturalWidth > 0 ? Math.min(1, available / naturalWidth) : 1
    setScale(next)
    setBoxHeight(naturalHeight * next)
  }, [])

  useEffect(() => {
    measure()
    const outer = outerRef.current
    if (!outer) return
    // Only outer is observed - it's the thing driven by something outside
    // this component (the grid column's own width, e.g. shrink-on-scroll).
    // Observing inner too used to create a feedback loop once inner's own
    // size was made to depend on state derived from measuring inner (that
    // approach was tried and reverted - it made column 3 grow without
    // bound in the Puck editor).
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(outer)
    }
    const inner = innerRef.current
    // ResizeObserver alone stays silent for a child that mutates without
    // resizing inner itself, e.g. a cart badge that appears once the cart
    // count loads async (it's absolutely positioned, so it never changes
    // inner's own box). A MutationObserver catches that content change so
    // the badge gets counted into the next scale calculation.
    let mo: MutationObserver | undefined
    if (inner && typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(() => measure())
      mo.observe(inner, { childList: true, subtree: true, characterData: true })
    }
    return () => { ro?.disconnect(); mo?.disconnect() }
  }, [measure])

  const originX = align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'
  const justify = align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'

  return (
    <div
      ref={outerRef}
      style={{ width: '100%', display: 'flex', justifyContent: justify, height: boxHeight }}
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
