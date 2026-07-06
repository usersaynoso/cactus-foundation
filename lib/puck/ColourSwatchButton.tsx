'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  name: string
  background: string
  selected: boolean
  onClick: () => void
}

// Portalled to document.body with a viewport-relative fixed position, rather
// than positioned inline - the sidebar sits in the same stacking context as
// Puck's canvas iframe, so an inline absolute/relative tooltip was rendering
// underneath the preview instead of above it.
export function ColourSwatchButton({ name, background, selected, onClick }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.top, left: rect.left + rect.width / 2 })
  }
  const hide = () => setCoords(null)

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={name}
        style={{
          width: 28, height: 28, borderRadius: 4,
          background,
          border: selected ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
          cursor: 'pointer', padding: 0, outline: selected ? '2px solid var(--color-success)' : 'none', outlineOffset: 1,
        }}
      />
      {coords && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed', top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)',
            marginTop: '-0.375rem', padding: '0.25rem 0.5rem', borderRadius: 4,
            background: 'var(--color-text)', color: 'var(--color-bg)',
            fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 999999,
          }}
        >
          {name}
        </div>,
        document.body,
      )}
    </>
  )
}
