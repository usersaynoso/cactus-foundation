'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { scaleToFitMetrics } from '@/lib/puck/scaleToFit'

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
  // Nothing has been measured until the first effect runs, which is one paint
  // AFTER the server's HTML has already been drawn. See the max-width below.
  const [measured, setMeasured] = useState(false)

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
    const prevMaxWidth = inner.style.maxWidth
    inner.style.transform = 'none'
    // The pre-measurement max-width has to come off as well, or the natural
    // width being measured is the clamped one - which reports as "already
    // fits", pins the scale at 1, and quietly disables the whole component.
    inner.style.maxWidth = 'none'
    const innerRect = inner.getBoundingClientRect()
    let right = innerRect.right
    let bottom = innerRect.bottom
    inner.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > right) right = r.right
      if (r.bottom > bottom) bottom = r.bottom
    })
    inner.style.transform = prevTransform
    inner.style.maxWidth = prevMaxWidth
    const naturalWidth = right - innerRect.left
    const naturalHeight = bottom - innerRect.top
    // null = nothing was measurable (see lib/puck/scaleToFit.ts for why that
    // must not be recorded). Stay unmeasured: the observers below fire again the
    // moment this gains a size, and the max-width guard holds the fort meanwhile.
    const metrics = scaleToFitMetrics(available, naturalWidth, naturalHeight)
    if (!metrics) return
    setScale(metrics.scale)
    setBoxHeight(metrics.boxHeight)
    setMeasured(true)
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
        style={{
          flex: '0 0 auto',
          transform: `scale(${scale})`,
          transformOrigin: `${originX} top`,
          // Until the first measurement lands, the scale is 1 and `flex: 0 0
          // auto` refuses to shrink - so the server's HTML paints the contents
          // at full size, overflowing the column and sitting on top of whatever
          // is beside it, before hydration snaps it down. A header logo wider
          // than its column did this every cold load. max-width makes that first
          // paint fit instead: an image inside carries `max-width: 100%` of its
          // own, so it lands at very nearly the size the measured scale is about
          // to give it. It comes off once measured, because a permanent clamp
          // would shrink the box AND then scale it, ending up too small.
          ...(measured ? {} : { maxWidth: '100%' }),
        }}
      >
        {children}
      </div>
    </div>
  )
}
