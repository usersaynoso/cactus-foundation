'use client'

import { useEffect, useRef, useState } from 'react'
import { useSiteFonts } from '@/lib/puck/useSiteFonts'
import GOOGLE_FONTS from '@/lib/design/google-fonts.json'
import { POPULAR_FONTS, MAX_FONT_SEARCH_RESULTS } from '@/lib/design/font-options'

type Props = {
  value: string
  onChange: (value: string) => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.375rem 0.5rem',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
}

const optionStyle = (selected: boolean): React.CSSProperties => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '0.4375rem 0.75rem',
  background: selected ? 'var(--color-success-bg)' : 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.875rem',
  color: selected ? 'var(--color-success)' : 'var(--color-text)',
})

// Font-family picker for Puck block fields: the site's named fonts (from
// Appearance → Styles) first, then the Google Fonts catalogue - same shape as
// the Styles page's FontPickerField, restyled for the Puck panel. Stores the
// family value; leaving it empty inherits the surrounding/site font.
export function SiteFontField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const siteFonts = useSiteFonts()

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = search.toLowerCase()
  const filteredSite = siteFonts.filter(f =>
    f.family && (!q || f.name.toLowerCase().includes(q) || f.family.toLowerCase().includes(q))
  )
  const matches = search ? (GOOGLE_FONTS as string[]).filter(f => f.toLowerCase().includes(q)) : POPULAR_FONTS
  const filtered = search ? matches.slice(0, MAX_FONT_SEARCH_RESULTS) : matches

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value ?? ''}
        onChange={e => { onChange(e.target.value); setSearch(e.target.value); setOpen(true) }}
        onFocus={() => { setSearch(''); setOpen(true) }}
        placeholder="Site font (leave empty)"
        style={inputStyle}
      />
      {open && (filteredSite.length > 0 || filtered.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--color-surface-raised, var(--color-surface))', border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
          {filteredSite.length > 0 && (
            <>
              <div style={{ padding: '0.375rem 0.75rem 0.25rem', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Your fonts</div>
              {filteredSite.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(f.family); setOpen(false) }}
                  style={{ ...optionStyle(f.family === value), display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', fontFamily: f.family.includes(',') ? f.family : `${f.family}, sans-serif` }}
                >
                  <span>{f.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>{f.family}</span>
                </button>
              ))}
              {filtered.length > 0 && <div style={{ borderTop: '1px solid var(--color-border)', margin: '0.25rem 0' }} />}
            </>
          )}
          {filtered.map(font => (
            <button
              key={font}
              type="button"
              onMouseDown={e => { e.preventDefault(); onChange(font); setOpen(false) }}
              style={{ ...optionStyle(font === value), fontFamily: font.includes(',') ? font : `${font}, sans-serif` }}
            >
              {font}
            </button>
          ))}
          {search && matches.length > MAX_FONT_SEARCH_RESULTS && (
            <div style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {matches.length - MAX_FONT_SEARCH_RESULTS} more match - keep typing to narrow down
            </div>
          )}
        </div>
      )}
    </div>
  )
}
