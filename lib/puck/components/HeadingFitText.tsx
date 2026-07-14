'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

// "Keep on one line" for the Heading block: measure what the text needs on a
// single line, compare it with the room the heading has actually been given, and
// paint the difference away.
//
// Same trick as the Menu block's fit-to-one-line (see MenuBlockClient), and for
// the same reason: a transform is a paint-time operation, so neither number we
// measure moves when the scale changes. The inner span's `offsetWidth` is always
// the text's natural one-line width, and the outer span is a block, so its
// `clientWidth` is whatever the column handed it. Nothing feeds back into
// anything, so it settles on the first pass. Shrinking the font size instead
// would change the very width we measure from, and each pass would chase the
// last one.
//
// Unlike the menu, the box height comes down with the text: a heading is tall,
// and a transform leaves the full-size line box behind, so a heading shrunk to
// 60% would otherwise float in a gap of its original height.
export default function HeadingFitText({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  // Kept as two primitives rather than one object: React bails out of a re-render
  // when a primitive setState lands on the same value, and the effect below
  // re-runs on every render (children is a fresh node array each time), so a
  // fresh object here would measure → set → render → measure forever.
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | undefined>(undefined)

  const measure = useCallback(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const avail = outer.clientWidth
    const natural = inner.offsetWidth
    // A hidden heading (display:none behind a "hide on mobile" rule, or inside a
    // collapsed header) measures zero - leave the last good scale alone rather
    // than snapping it back to full size.
    if (avail <= 0 || natural <= 0) return
    const next = natural > avail ? avail / natural : 1
    setScale(next)
    setHeight(next < 1 ? inner.offsetHeight * next : undefined)
  }, [])

  useEffect(() => {
    measure()
    const outer = outerRef.current
    if (!outer) return
    // Only the outer box is observed: it's the one driven from outside this
    // component (the column's width, a header shrinking on scroll, the viewport).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : undefined
    ro?.observe(outer)
    // A web font landing after first paint changes what the text needs without
    // changing the outer box, so the observer above would never hear about it.
    document.fonts?.ready?.then(() => measure()).catch(() => {})
    return () => ro?.disconnect()
    // children: re-measure when the heading's text is edited in the canvas.
  }, [measure, children])

  const shrunk = scale < 1

  return (
    <span
      ref={outerRef}
      style={{
        display: 'block',
        // Clips the one-line text to the column for the frame or two before the
        // measurement lands, so a long heading can't throw a horizontal
        // scrollbar across the page on the way past. `clip` rather than
        // `hidden`: it only touches the horizontal axis, where `hidden` would
        // make the vertical one a scroll container and crop the emphasis
        // underline off the bottom.
        overflowX: 'clip',
        // Shrunk text fills its box exactly, so there's no free space left for an
        // alignment to distribute - pin it left, which gives the scale origin
        // below a fixed edge to work from whatever the heading's own alignment
        // is. Unshrunk, the heading's own text-align (including its per-device
        // overrides) is inherited untouched.
        ...(shrunk ? { height, textAlign: 'left' as const } : {}),
      }}
    >
      <span
        ref={innerRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          // Pins the inner box to the top of the line box, so scaling from its
          // top-left corner paints the text exactly where the box starts.
          verticalAlign: 'top',
          ...(shrunk ? { transform: `scale(${scale})`, transformOrigin: 'left top' } : {}),
        }}
      >
        {children}
      </span>
    </span>
  )
}
