'use client'

import { useState, useEffect } from 'react'

type Mode = 'auto' | 'light' | 'dark'

function applyTheme(mode: Mode) {
  const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>('auto')

  useEffect(() => {
    const stored = (localStorage.getItem('cactus-theme') as Mode) ?? 'auto'
    setMode(stored)
    applyTheme(stored)
  }, [])

  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) =>
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  function apply(m: Mode) {
    setMode(m)
    localStorage.setItem('cactus-theme', m)
    applyTheme(m)
  }

  const btnStyle = (m: Mode): React.CSSProperties => ({
    background: mode === m ? 'rgba(255,255,255,0.15)' : 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: compact ? '0.25rem 0.375rem' : '0.375rem 0.625rem',
    borderRadius: 4,
    fontSize: compact ? '0.75rem' : '0.8125rem',
    fontFamily: 'inherit',
  })

  return (
    <div role="group" aria-label="Colour scheme" style={{ display: 'flex', gap: '0.125rem' }}>
      <button onClick={() => apply('auto')}  aria-pressed={mode === 'auto'}  style={btnStyle('auto')}  title="Auto (follow system)">Auto</button>
      <button onClick={() => apply('light')} aria-pressed={mode === 'light'} style={btnStyle('light')} title="Light mode">☀</button>
      <button onClick={() => apply('dark')}  aria-pressed={mode === 'dark'}  style={btnStyle('dark')}  title="Dark mode">☽</button>
    </div>
  )
}
