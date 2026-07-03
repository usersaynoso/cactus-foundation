'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'

export type TabStripItem = {
  key: string
  label: ReactNode
  href?: string
  onClick?: () => void
  active: boolean
}

type Props = {
  items: TabStripItem[]
  /** Fixed content pinned to the right of the scroll area, e.g. a result count. */
  trailing?: ReactNode
  style?: CSSProperties
}

const FADE_WIDTH = '2rem'
const ARROW_WIDTH = '1.5rem'
const PAGE_BG = 'var(--color-page-bg, var(--color-bg))'

const tabStyle = (active: boolean): CSSProperties => ({
  padding: '0.625rem 1rem',
  border: 'none',
  background: 'none',
  textDecoration: 'none',
  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
  color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
  fontWeight: active ? 600 : 400,
  fontSize: 'var(--text-base)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
})

/** Underline-style horizontal tab bar shared by every admin page with tabs. Scrolls
 * with edge fades and arrow buttons when the tab list overflows its container. */
export function TabStrip({ items, trailing, style }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 1)
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    }
    check()
    el.addEventListener('scroll', check)
    window.addEventListener('resize', check)
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
      ro.disconnect()
    }
  }, [items])

  function scrollBy(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border)', marginBottom: '1rem', ...style }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div ref={scrollRef} className="no-scrollbar" style={{ display: 'flex', overflowX: 'auto' }}>
          {items.map((item) => item.href ? (
            <Link key={item.key} href={item.href} prefetch={false} style={tabStyle(item.active)}>
              {item.label}
            </Link>
          ) : (
            <button key={item.key} type="button" onClick={item.onClick} style={tabStyle(item.active)}>
              {item.label}
            </button>
          ))}
        </div>
        {canScrollLeft && (
          <>
            <div aria-hidden style={{ position: 'absolute', left: ARROW_WIDTH, top: 0, bottom: 0, width: FADE_WIDTH, background: `linear-gradient(to right, ${PAGE_BG}, transparent)`, pointerEvents: 'none' }} />
            <button
              type="button"
              onClick={() => scrollBy(-160)}
              aria-label="Scroll tabs left"
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: ARROW_WIDTH, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', background: PAGE_BG, color: 'var(--color-text-muted)', fontFamily: 'inherit', fontSize: '1rem', padding: 0 }}
            >
              ‹
            </button>
          </>
        )}
        {canScrollRight && (
          <>
            <div aria-hidden style={{ position: 'absolute', right: ARROW_WIDTH, top: 0, bottom: 0, width: FADE_WIDTH, background: `linear-gradient(to left, ${PAGE_BG}, transparent)`, pointerEvents: 'none' }} />
            <button
              type="button"
              onClick={() => scrollBy(160)}
              aria-label="Scroll tabs right"
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: ARROW_WIDTH, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', background: PAGE_BG, color: 'var(--color-text-muted)', fontFamily: 'inherit', fontSize: '1rem', padding: 0 }}
            >
              ›
            </button>
          </>
        )}
      </div>
      {trailing && <div style={{ flexShrink: 0, marginLeft: '0.75rem' }}>{trailing}</div>}
    </div>
  )
}
