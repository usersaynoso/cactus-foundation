import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Traps Tab focus inside a modal container and restores focus to whatever was
// focused before it opened. Every overlay here is aria-modal, so keyboard and
// screen-reader users should stay within it and land back where they started on
// close. Pass the container ref; `active` gates it (default on).
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  // Captured synchronously on activation so it isn't lost to a later re-render.
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    restoreTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // Move focus in if it isn't already inside - first real control, else the
    // container itself (which callers mark tabIndex={-1}).
    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? container).focus()
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) { e.preventDefault(); container.focus(); return }
      const activeEl = document.activeElement
      if (e.shiftKey && (activeEl === first || activeEl === container)) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault(); first.focus()
      }
    }

    container.addEventListener('keydown', onKey)
    return () => {
      container.removeEventListener('keydown', onKey)
      restoreTo.current?.focus?.()
    }
  }, [ref, active])
}
