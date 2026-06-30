'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type Layout = {
  id: string
  name: string
  type: string
  description: string | null
  status: string
  isStarter: boolean
  displayConditions: { include?: Array<{ type: string; value?: string }> } | null
  createdAt: string
}

type Tab = { key: string; label: string; type: string | null }

const TABS: Tab[] = [
  { key: 'all',        label: 'All',          type: null },
  { key: 'header',     label: 'Header',       type: 'header' },
  { key: 'footer',     label: 'Footer',       type: 'footer' },
  { key: 'infoPage',   label: 'Page Layout',  type: 'infoPage' },
  { key: 'notFound',   label: '404',          type: 'notFound' },
  { key: 'statusPage', label: 'Status Page',  type: 'statusPage' },
]

const TYPE_LABELS: Record<string, string> = {
  header: 'Header', footer: 'Footer', infoPage: 'Page Layout',
  notFound: '404', statusPage: 'Status Page',
}

function conditionSummary(layout: Layout): string {
  if (layout.status === 'draft') return 'Draft — no conditions set'
  const inc = layout.displayConditions?.include ?? []
  if (!inc.length) return 'No conditions'
  if (inc.some(r => r.type === 'entire_site')) return 'Entire site'
  if (inc.some(r => r.type === 'homepage')) return 'Homepage'
  if (inc.some(r => r.type === 'not_found')) return '404 pages'
  const hasComingSoon = inc.some(r => r.type === 'coming_soon')
  const hasMaintenance = inc.some(r => r.type === 'maintenance')
  if (hasComingSoon && hasMaintenance) return 'Coming soon + Maintenance'
  if (hasComingSoon) return 'Coming soon'
  if (hasMaintenance) return 'Maintenance'
  return `${inc.length} condition${inc.length === 1 ? '' : 's'}`
}

export default function ThemeBuilderPage() {
  const adminPath = useAdminPath()
  const [activeTab, setActiveTab] = useState<string>('all')
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function reload(type: string | null) {
    setLoading(true)
    const url = type ? `/api/admin/layouts?type=${type}` : '/api/admin/layouts'
    fetch(url)
      .then(r => r.json())
      .then(d => { setLayouts(d.layouts ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load layouts'); setLoading(false) })
  }

  useEffect(() => {
    const tab = TABS.find(t => t.key === activeTab)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload sets loading flag before async fetch; standard data-load pattern
    reload(tab?.type ?? null)
  }, [activeTab])

  async function handleDelete(id: string) {
    if (!confirm('Delete this layout? This cannot be undone.')) return
    try {
      await fetch(`/api/admin/layouts/${id}`, { method: 'DELETE' })
      const tab = TABS.find(t => t.key === activeTab)
      reload(tab?.type ?? null)
    } catch { setError('Failed to delete layout') }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Theme Builder</h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-base)' }}>Create typed layouts for headers, footers, pages, and status screens.</p>
        </div>
        <Link href={`/${adminPath}/layouts/new`} className="btn btn-primary">+ New Layout</Link>
      </div>

      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.5rem 1rem', border: 'none', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', cursor: 'pointer',
              background: activeTab === tab.key ? 'var(--color-surface)' : 'transparent',
              borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 'var(--text-sm)', fontFamily: 'inherit',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}
      {error && <div style={{ padding: '1rem', color: 'var(--color-destructive)' }}>{error}</div>}

      {!loading && layouts.length === 0 && (
        <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No layouts here yet. <Link href={`/${adminPath}/layouts/new`}>Create your first layout</Link>.
        </div>
      )}

      {!loading && layouts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {layouts.map((layout) => (
            <div key={layout.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: 'var(--color-bg-subtle)', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--color-border)' }}>
                <LayoutThumbnail type={layout.type} name={layout.name} />
              </div>
              <div style={{ padding: '1rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{layout.name}</h3>
                  <TypeBadge type={layout.type} />
                  {layout.status === 'published' && <StatusBadge status="published" />}
                  {layout.status === 'draft' && <StatusBadge status="draft" />}
                  {layout.isStarter && <span className="badge badge-gray" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' }}>Starter</span>}
                </div>
                {layout.description && <p style={{ margin: '0 0 0.5rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{layout.description}</p>}
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{conditionSummary(layout)}</p>
              </div>
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link href={`/${adminPath}/layouts/${layout.id}`} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Edit</Link>
                <a href={`/layout-preview/${layout.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Preview</a>
                {!layout.isStarter && (
                  <button onClick={() => handleDelete(layout.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-destructive)', fontSize: 'var(--text-sm)', cursor: 'pointer', padding: '0.375rem 0' }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="badge badge-blue" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') return <span className="badge badge-green" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Published</span>
  return <span className="badge badge-yellow" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Draft</span>
}

function LayoutThumbnail({ type, name }: { type: string; name: string }) {
  if (type === 'header') {
    return (
      <div style={{ width: '80%', height: 28, background: 'var(--color-primary-subtle)', borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', justifyContent: 'space-between' }}>
        <div style={{ width: 24, height: 10, background: 'var(--color-primary)', borderRadius: 2, opacity: 0.4 }} />
        <div style={{ display: 'flex', gap: 4 }}>{[0,1,2].map(i => <div key={i} style={{ width: 14, height: 6, background: 'var(--color-primary)', borderRadius: 2, opacity: 0.4 }} />)}</div>
      </div>
    )
  }
  if (type === 'footer') {
    return (
      <div style={{ width: '80%', height: 28, background: 'var(--color-bg-subtle)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 60, height: 6, background: 'var(--color-border-strong)', borderRadius: 2 }} />
      </div>
    )
  }
  if (type === 'notFound' || type === 'statusPage') {
    return (
      <div style={{ width: '80%', height: 36, background: 'var(--color-warning-bg)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 10, background: 'var(--color-warning)', borderRadius: 2, opacity: 0.5 }} />
      </div>
    )
  }
  const n = name.toLowerCase()
  if (n.includes('sidebar') && (n.includes('right') || n.includes('70'))) {
    return <div style={{ display: 'flex', gap: 4, height: 44, width: '80%' }}><div style={{ flex: 7, background: 'var(--color-primary-subtle)', borderRadius: 3 }} /><div style={{ flex: 3, background: 'var(--color-bg-subtle)', borderRadius: 3 }} /></div>
  }
  if (n.includes('sidebar') && n.includes('left')) {
    return <div style={{ display: 'flex', gap: 4, height: 44, width: '80%' }}><div style={{ flex: 3, background: 'var(--color-bg-subtle)', borderRadius: 3 }} /><div style={{ flex: 7, background: 'var(--color-primary-subtle)', borderRadius: 3 }} /></div>
  }
  if (n.includes('boxed') || n.includes('centred') || n.includes('centered')) {
    return <div style={{ display: 'flex', justifyContent: 'center', height: 44, width: '80%' }}><div style={{ width: '70%', background: 'var(--color-primary-subtle)', borderRadius: 3 }} /></div>
  }
  return <div style={{ width: '80%', height: 44, background: 'var(--color-primary-subtle)', borderRadius: 3 }} />
}
