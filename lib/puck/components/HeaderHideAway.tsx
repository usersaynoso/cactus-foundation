'use client'

import { useEffect, useRef } from 'react'

// "Hide what scrolls away once pinned", for a header set to Sticky (top part
// scrolls away). The negative sticky top lets the top rows travel off screen,
// but only as far as the owner's number: set it any lower than the full height
// of the logo row, to keep a strip of header colour above the row that stays,
// and the bottom of the logo is left poking out of that strip. This fades
// those rows out once the header has pinned instead.
//
// Which rows go is decided from geometry, not from a list of block types, so
// it works for whatever the owner put up there. The line is the scroll-away
// height itself (read back from the header's own resolved `top`, so it follows
// every breakpoint and unit without re-parsing them). Walking down from the
// header's content:
// - a box that starts at or below the line is in the pinned part: kept
// - a box that ends above the line, or a leaf whose middle is above it, goes
// - a container straddling the line is opened up and its children judged
// Fixed boxes (the mobile quick-links bar lives in the header) belong to the
// viewport and are never touched. Zero-size boxes (display: contents, or a
// breakpoint that is hidden) are looked through rather than judged.
//
// Pinned is read from where the header actually is rather than from scrollY,
// so anything sitting above the header does not throw the threshold out.
// Mirrored as a plain string in headerRootRender's CSS: a server file reading a
// value out of a 'use client' module gets a throwing proxy, not the string.
const HEADER_AWAY_ATTR = 'data-header-away'

export default function HeaderHideAway({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const header = ref.current?.querySelector<HTMLElement>('header[data-header-root]')
    const win = header?.ownerDocument.defaultView
    if (!header || !win) return

    let line = 0
    let pinned = false
    let frame = 0

    function mark() {
      if (!header || !win) return
      header.querySelectorAll(`[${HEADER_AWAY_ATTR}]`).forEach((el) => el.removeAttribute(HEADER_AWAY_ATTR))
      line = -parseFloat(win.getComputedStyle(header).top)
      const inner = header.querySelector<HTMLElement>('[data-header-inner]')
      if (!inner || !(line > 0)) return
      const headerTop = header.getBoundingClientRect().top
      const walk = (parent: Element) => {
        for (const child of Array.from(parent.children)) {
          if (!(child instanceof HTMLElement) || child instanceof HTMLStyleElement) continue
          if (win.getComputedStyle(child).position === 'fixed') continue
          const r = child.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) { walk(child); continue }
          const top = r.top - headerTop
          const bottom = r.bottom - headerTop
          if (top >= line - 0.5) continue
          const leaf = child.children.length === 0
          if (bottom <= line + 0.5 || (leaf && (top + bottom) / 2 < line)) {
            child.setAttribute(HEADER_AWAY_ATTR, '')
          } else if (!leaf) {
            walk(child)
          }
        }
      }
      walk(inner)
    }

    function apply() {
      frame = 0
      if (!header) return
      const next = line > 0 && header.getBoundingClientRect().top <= -line + 0.5
      if (next === pinned) return
      pinned = next
      header.toggleAttribute('data-pinned', next)
    }

    function onScroll() {
      if (frame || !win) return
      frame = win.requestAnimationFrame(apply)
    }

    // Layout changes (a breakpoint, a shrink-on-scroll height, a late font or
    // logo) move the rows about, so the verdicts are re-taken whenever the
    // header or its content box changes size, and on a window resize - a
    // breakpoint can swap one set of rows for another at the same header height.
    // Opacity and visibility do not affect layout, so a re-mark while the rows
    // are hidden sees the same geometry.
    const remark = () => { mark(); apply() }
    const observer = new ResizeObserver(remark)
    observer.observe(header)
    const content = header.querySelector('[data-header-inner]')?.firstElementChild
    if (content) observer.observe(content)
    remark()
    win.addEventListener('scroll', onScroll, { passive: true })
    win.addEventListener('resize', remark)
    return () => {
      observer.disconnect()
      win.removeEventListener('scroll', onScroll)
      win.removeEventListener('resize', remark)
      if (frame) win.cancelAnimationFrame(frame)
      header.removeAttribute('data-pinned')
      header.querySelectorAll(`[${HEADER_AWAY_ATTR}]`).forEach((el) => el.removeAttribute(HEADER_AWAY_ATTR))
    }
  }, [])

  return <div ref={ref} style={{ display: 'contents' }}>{children}</div>
}
