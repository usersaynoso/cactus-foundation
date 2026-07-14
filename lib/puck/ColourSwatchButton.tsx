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

// A colour is "custom" when it isn't one of the palette `var(--color-N)` swatches
// and isn't blank - i.e. the user typed their own value. The picker's native
// input only speaks hex, so a non-hex custom value (rgb(), a named colour) still
// shows as the swatch background but the picker opens on a neutral default.
export function isCustomColour(value: string): boolean {
  return !!value && !value.startsWith('var(')
}

// Same 28×28 swatch as ColourSwatchButton, but it opens the browser's native
// colour picker so owners can set any colour instead of only the palette. Shows
// a rainbow face until a custom colour is chosen, then the chosen colour itself.
export function CustomColourSwatch({ value, onSelect }: { value: string; onSelect: (color: string) => void }) {
  const custom = isCustomColour(value)
  const hex = custom && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : '#888888'
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const labelRef = useRef<HTMLLabelElement>(null)

  const show = () => {
    const rect = labelRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.top, left: rect.left + rect.width / 2 })
  }
  const hide = () => setCoords(null)

  return (
    <>
      <label
        ref={labelRef}
        aria-label="Custom colour"
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          width: 28, height: 28, borderRadius: 4,
          background: custom ? value : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
          border: custom ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
          cursor: 'pointer', padding: 0, outline: custom ? '2px solid var(--color-success)' : 'none', outlineOffset: 1,
          display: 'inline-block', position: 'relative', overflow: 'hidden',
        }}
      >
        <input
          type="color"
          value={hex}
          onChange={(e) => onSelect(e.target.value)}
          onFocus={show}
          onBlur={hide}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
        />
      </label>
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
          Custom colour
        </div>,
        document.body,
      )}
    </>
  )
}
