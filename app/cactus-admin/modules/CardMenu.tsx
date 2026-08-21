'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  label: string
  /** Rendered inside the popover. `close` dismisses it, e.g. after picking an action. */
  children: (close: () => void) => ReactNode
}

/**
 * The "more actions" menu on a module card. Everything a card can do that is not its
 * one primary action lives in here, which is what keeps the card itself down to a
 * picture, a name, a description and a single button.
 */
export function CardMenu({ label, children }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="module-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        &hellip;
      </button>
      {open && (
        <div className="module-menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
