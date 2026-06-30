'use client'

import { useState, useEffect, useCallback } from 'react'

type Mode = 'auto' | 'light' | 'dark'

function applyTheme(mode: Mode) {
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
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

  const btnStyle = (m: Mode): React.CSSProperties => ({
    background: mode === m ? 'var(--color-primary-subtle)' : 'transparent',
    border: 'none',
    color: mode === m ? 'var(--color-primary)' : 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: compact ? '0.25rem 0.375rem' : '0.375rem 0.625rem',
    borderRadius: 'var(--radius-sm)',
    fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
    fontFamily: 'inherit',
    transition: 'background var(--dur-base), color var(--dur-base)',
  })

  return (
    <div role="group" aria-label="Colour scheme" style={{ display: 'flex', gap: '0.125rem' }}>
      <button onClick={() => apply('auto')}  aria-pressed={mode === 'auto'}  style={btnStyle('auto')}  title="Auto (follow system)">Auto</button>
      <button onClick={() => apply('light')} aria-pressed={mode === 'light'} style={btnStyle('light')} title="Light mode">☀</button>
      <button onClick={() => apply('dark')}  aria-pressed={mode === 'dark'}  style={btnStyle('dark')}  title="Dark mode">☽</button>
    </div>
  )
}
