'use client'

import { useEffect, useRef } from 'react'

// Toggles data-shrunk on the header element past a scroll threshold. Listens
// on window, which resolves correctly both on the live site and inside the
// Puck editor's canvas iframe (each iframe has its own window/scroll).
export default function HeaderShrinkScroll({ threshold = 40, children }: { threshold?: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const header = ref.current?.firstElementChild as HTMLElement | null
    if (!header) return
    function onScroll() {
      if (!header) return
      header.toggleAttribute('data-shrunk', window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return <div ref={ref} style={{ display: 'contents' }}>{children}</div>
}
