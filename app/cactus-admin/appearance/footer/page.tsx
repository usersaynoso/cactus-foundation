'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import Link from 'next/link'

const AppearancePuckEditor = dynamic(() => import('../AppearancePuckEditor'), {
  ssr: false,
  loading: () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>Loading footer editor…</div>,
})

export default function AppearanceFooterPage() {
  const [initialData, setInitialData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/admin/appearance')
      .then((r) => r.json())
      .then((d) => {
        setInitialData((d.footerBuilderData as Data | null) ?? { content: [], root: { props: {} }, zones: {} })
        setLoading(false)
      })
      .catch(() => { setError('Failed to load footer data'); setLoading(false) })
  }, [])

  const handleChange = useCallback((data: Data) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSaving(true)
      setSaved(false)
      try {
        const res = await fetch('/api/admin/appearance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ footerBuilderData: data }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Save failed') }
        else setSaved(true)
      } catch { setError('Save failed') }
      finally { setSaving(false) }
    }, 1200)
  }, [])

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>
  if (error && !initialData) return <div style={{ padding: '2rem', color: '#dc2626' }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.625rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.8125rem', color: '#6b7280', flexShrink: 0 }}>
        <AppearanceTabBar active="footer" />
        <span style={{ marginLeft: 'auto' }}>
          {saving && 'Saving…'}
          {!saving && saved && <span style={{ color: '#15803d' }}>Saved ✓</span>}
          {error && <span style={{ color: '#dc2626' }}>{error}</span>}
        </span>
      </div>
      {initialData && <AppearancePuckEditor mode="footer" initialData={initialData} onChange={handleChange} />}
    </div>
  )
}

function AppearanceTabBar({ active }: { active: 'header' | 'footer' | 'design' }) {
  const tabs = [
    { key: 'header', label: 'Header', href: '/cactus-admin/appearance/header' },
    { key: 'footer', label: 'Footer', href: '/cactus-admin/appearance/footer' },
    { key: 'design', label: 'Design Tokens', href: '/cactus-admin/appearance/design' },
  ] as const
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} style={{
          padding: '0.375rem 0.875rem', borderRadius: 4, textDecoration: 'none', fontWeight: t.key === active ? 600 : 400,
          background: t.key === active ? '#ffffff' : 'transparent', color: t.key === active ? '#111827' : '#6b7280',
          border: t.key === active ? '1px solid #e5e7eb' : '1px solid transparent', fontSize: '0.8125rem',
        }}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
