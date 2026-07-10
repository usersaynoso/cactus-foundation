'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

type Mode = 'auto' | 'light' | 'dark'

export type ThemeToggleStyle =
  | 'segmented'
  | 'text'
  | 'expand'
  | 'dropdown'
  | 'switch'
  | 'cycle'

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(mode: Mode) {
  const isDark = mode === 'dark' || (mode === 'auto' && systemPrefersDark())
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

const LightIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
)

const AutoIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v16" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
  </svg>
)

const DarkIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
  </svg>
)

const ICONS: Record<Mode, React.ReactNode> = { light: LightIcon, auto: AutoIcon, dark: DarkIcon }
const LABELS: Record<Mode, string> = { light: 'Light', auto: 'Auto', dark: 'Dark' }
const MODES: Mode[] = ['light', 'auto', 'dark']
// Cycle order when collapsed: light → auto (system) → dark → light
const NEXT_MODE: Record<Mode, Mode> = { light: 'auto', auto: 'dark', dark: 'light' }

/** Shared theme state: reads persisted mode, applies it, keeps system changes live. */
function useThemeMode(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('cactus-theme') as Mode) ?? 'auto' : 'auto'
  )

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  const onSystemChange = useCallback((e: MediaQueryListEvent) => {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onSystemChange)
    return () => mq.removeEventListener('change', onSystemChange)
  }, [mode, onSystemChange])

  const apply = useCallback((m: Mode) => {
    setMode(m)
    localStorage.setItem('cactus-theme', m)
    applyTheme(m)
  }, [])

  return [mode, apply]
}

/** Popover option list — shared by the expand (hover) and dropdown (click) styles. */
function ThemeMenu({ mode, apply, onPick }: { mode: Mode; apply: (m: Mode) => void; onPick?: () => void }) {
  return (
    <div className="tt-menu" role="listbox" aria-label="Colour scheme">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className="tt-menu-item"
          role="option"
          aria-selected={mode === m}
          onClick={() => { apply(m); onPick?.() }}
        >
          <span className="tt-menu-icon" aria-hidden="true">{ICONS[m]}</span>
          <span>{LABELS[m]}</span>
        </button>
      ))}
    </div>
  )
}

export function ThemeToggle({
  compact = false,
  collapsed = false,
  style = 'segmented',
}: {
  compact?: boolean
  collapsed?: boolean
  style?: ThemeToggleStyle
}) {
  const [mode, apply] = useThemeMode()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the dropdown menu on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The admin sidebar collapses to a single cycle button regardless of style.
  const effectiveStyle: ThemeToggleStyle = collapsed ? 'cycle' : style

  // --- Cycle: one icon, click steps light → auto → dark ---
  if (effectiveStyle === 'cycle') {
    const next = NEXT_MODE[mode]
    return (
      <button
        type="button"
        className="theme-toggle-cycle"
        onClick={() => apply(next)}
        title={`Colour scheme: ${LABELS[mode]}`}
        aria-label={`Colour scheme: ${LABELS[mode]}. Switch to ${LABELS[next]}.`}
      >
        {ICONS[mode]}
      </button>
    )
  }

  // --- Switch: two-state sun/moon slider (light ↔ dark, no auto) ---
  if (effectiveStyle === 'switch') {
    const isDark = mode === 'dark' || (mode === 'auto' && systemPrefersDark())
    return (
      <button
        type="button"
        className={`theme-switch${compact ? ' theme-switch--compact' : ''}`}
        role="switch"
        aria-checked={isDark}
        aria-label={`Dark mode ${isDark ? 'on' : 'off'}`}
        title={isDark ? 'Dark mode' : 'Light mode'}
        data-dark={isDark ? 'true' : 'false'}
        onClick={() => apply(isDark ? 'light' : 'dark')}
      >
        <span className="theme-switch-icon theme-switch-icon--light" aria-hidden="true">{LightIcon}</span>
        <span className="theme-switch-icon theme-switch-icon--dark" aria-hidden="true">{DarkIcon}</span>
        <span className="theme-switch-knob" aria-hidden="true" />
      </button>
    )
  }

  // --- Expand (hover) & Dropdown (click): trigger icon + option menu ---
  if (effectiveStyle === 'expand' || effectiveStyle === 'dropdown') {
    const isDropdown = effectiveStyle === 'dropdown'
    return (
      <div
        ref={rootRef}
        className={`theme-menu-wrap theme-menu-wrap--${effectiveStyle}${compact ? ' theme-menu-wrap--compact' : ''}`}
        data-open={isDropdown && open ? 'true' : 'false'}
      >
        <button
          type="button"
          className="theme-toggle-cycle theme-menu-trigger"
          onClick={isDropdown ? () => setOpen((v) => !v) : undefined}
          aria-haspopup="listbox"
          aria-expanded={isDropdown ? open : undefined}
          title={`Colour scheme: ${LABELS[mode]}`}
          aria-label={`Colour scheme: ${LABELS[mode]}`}
        >
          {ICONS[mode]}
        </button>
        <ThemeMenu mode={mode} apply={apply} onPick={isDropdown ? () => setOpen(false) : undefined} />
      </div>
    )
  }

  // --- Segmented (icons) & Text (labels): sliding-knob 3-way control ---
  const isText = effectiveStyle === 'text'
  return (
    <div
      role="group"
      aria-label="Colour scheme"
      className={`theme-toggle${compact ? ' theme-toggle--compact' : ''}${isText ? ' theme-toggle--text' : ''}`}
      data-mode={mode}
    >
      <span className="theme-toggle-knob" aria-hidden="true" />

      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className="theme-toggle-btn"
          onClick={() => apply(m)}
          aria-pressed={mode === m}
          aria-label={m === 'auto' ? 'Auto (follow system)' : `${LABELS[m]} mode`}
        >
          {isText ? <span className="theme-toggle-label">{LABELS[m]}</span> : ICONS[m]}
          {!isText && <span className="theme-toggle-tip" aria-hidden="true">{LABELS[m]}</span>}
        </button>
      ))}
    </div>
  )
}
