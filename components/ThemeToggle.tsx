'use client'

import { useState, useEffect, useCallback } from 'react'

type Mode = 'auto' | 'light' | 'dark'

function applyTheme(mode: Mode) {
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
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
// Cycle order when collapsed: light → auto (system) → dark → light
const NEXT_MODE: Record<Mode, Mode> = { light: 'auto', auto: 'dark', dark: 'light' }

export function ThemeToggle({ compact = false, collapsed = false }: { compact?: boolean; collapsed?: boolean }) {
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

  function apply(m: Mode) {
    setMode(m)
    localStorage.setItem('cactus-theme', m)
    applyTheme(m)
  }

  if (collapsed) {
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

  return (
    <div
      role="group"
      aria-label="Colour scheme"
      className={`theme-toggle${compact ? ' theme-toggle--compact' : ''}`}
      data-mode={mode}
    >
      <span className="theme-toggle-knob" aria-hidden="true" />

      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => apply('light')}
        aria-pressed={mode === 'light'}
        aria-label="Light mode"
      >
        {LightIcon}
        <span className="theme-toggle-tip" aria-hidden="true">Light</span>
      </button>

      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => apply('auto')}
        aria-pressed={mode === 'auto'}
        aria-label="Auto (follow system)"
      >
        {AutoIcon}
        <span className="theme-toggle-tip" aria-hidden="true">Auto</span>
      </button>

      <button
        type="button"
        className="theme-toggle-btn"
        onClick={() => apply('dark')}
        aria-pressed={mode === 'dark'}
        aria-label="Dark mode"
      >
        {DarkIcon}
        <span className="theme-toggle-tip" aria-hidden="true">Dark</span>
      </button>
    </div>
  )
}
