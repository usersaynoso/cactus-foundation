'use client'

import { useEffect, useRef } from 'react'

// Toggles data-shrunk on the header element past a scroll threshold. Listens
// on window, which resolves correctly both on the live site and inside the
// Puck editor's canvas iframe (each iframe has its own window/scroll).
//
// Two thresholds, not one. The header sits in flow, so shrinking it removes
// its height delta from the document and drags scrollY back down. With a
// single threshold that lands you under it again, un-shrinks, and the pair
// oscillate every frame. The release point sits a whole header-height below
// the shrink point so the delta can never carry you back across it.
export default function HeaderShrinkScroll({ threshold = 40, children }: { threshold?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const header = ref.current?.firstElementChild as HTMLElement | null
    if (!header) return

    let shrunk = header.hasAttribute('data-shrunk')
    let frame = 0

    function apply() {
      frame = 0
      if (!header) return
      const y = window.scrollY
      // Release point trails the shrink point by the full expanded header
      // height, which is always larger than the shrink delta.
      const release = Math.max(0, threshold - header.offsetHeight)
      const next = shrunk ? y > release : y > threshold
      if (next === shrunk) return
      shrunk = next
      header.toggleAttribute('data-shrunk', next)
    }

    function onScroll() {
      if (frame) return
      frame = window.requestAnimationFrame(apply)
    }

    apply()
    // Arm CSS transitions that must not animate on first paint (e.g. the logo's
    // height, which is resolved from an inline desktop base plus in-body media
    // rules and would otherwise animate big->correct on an uncached load). Set
    // after the first apply(), i.e. past first paint, so only real scroll-driven
    // changes animate. rAF defers it one frame so the initial value is committed
    // transition-free first.
    window.requestAnimationFrame(() => header?.setAttribute('data-shrink-ready', ''))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [threshold])

  return <div ref={ref} style={{ display: 'contents' }}>{children}</div>
}
