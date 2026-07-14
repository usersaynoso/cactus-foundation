'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { TabStrip } from '@/components/admin/TabStrip'
import { LayoutPreview } from '@/components/admin/LayoutPreview'
import { moduleLayoutTypeGroups, moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { CORE_TYPE_TABS, MODULE_GROUP_TABS, TYPE_LABELS, type LayoutTypeTab } from '@/lib/layout/layout-type-tabs'

type Layout = {
  id: string
  name: string
  type: string
  description: string | null
  status: string
  builderData: unknown
  displayConditions: { include?: Array<{ type: string; value?: string }> } | null
  createdAt: string
}

const ALL_TAB: LayoutTypeTab = { key: 'all', label: 'All', type: null }
const TABS: LayoutTypeTab[] = [ALL_TAB, ...CORE_TYPE_TABS, ...MODULE_GROUP_TABS]

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

export default function LayoutBuilderPage() {
  const adminPath = useAdminPath()
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type')
  const initialTop = TABS.some((t) => t.key === typeParam) ? typeParam! : 'all'
  const [activeTop, setActiveTop] = useState<string>(initialTop)
  const [activeModuleSub, setActiveModuleSub] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const activeGroup = moduleLayoutTypeGroups.find((g) => g.moduleName === activeTop) ?? null
  const activeType = activeGroup
    ? (activeModuleSub ?? activeGroup.types[0]?.key ?? null)
    : (TABS.find(t => t.key === activeTop)?.type ?? null)

  // The picker opens on whichever type is in view, so "+ New Layout" from the
  // Footer tab starts you on footers.
  const newHref = activeType
    ? `/${adminPath}/layouts/new?type=${activeType}`
    : `/${adminPath}/layouts/new`

  function reload(type: string | null) {
    setLoading(true)
    const url = type ? `/api/admin/layouts?type=${type}` : '/api/admin/layouts'
    fetch(url)
      .then(r => r.json())
      .then(d => { setLayouts(d.layouts ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load layouts'); setLoading(false) })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload sets loading flag before async fetch; standard data-load pattern
    reload(activeType)
  }, [activeType])

  function handleTopClick(key: string) {
    setActiveTop(key)
    setActiveModuleSub(null)
  }

  async function handleDuplicate(id: string) {
    setDuplicatingId(id)
    setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${id}/duplicate`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to duplicate layout'); setDuplicatingId(null); return }
      router.push(`/${adminPath}/layouts/${d.id}`)
    } catch { setError('Failed to duplicate layout'); setDuplicatingId(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this layout? This cannot be undone.')) return
    try {
      await fetch(`/api/admin/layouts/${id}`, { method: 'DELETE' })
      reload(activeType)
    } catch { setError('Failed to delete layout') }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Layouts</h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-base)' }}>Create typed layouts for headers, footers, pages, and status screens.</p>
        </div>
        <Link href={newHref} className="btn btn-primary">+ New Layout</Link>
      </div>

      <TabStrip
        style={{ marginBottom: activeGroup ? '0.75rem' : '1.5rem' }}
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label, active: activeTop === tab.key, onClick: () => handleTopClick(tab.key) }))}
      />

      {activeGroup && (
        <TabStrip
          style={{ marginBottom: '1.5rem' }}
          items={activeGroup.types.map((t) => ({ key: t.key, label: t.label, active: activeType === t.key, onClick: () => setActiveModuleSub(t.key) }))}
        />
      )}

      {loading && <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}
      {error && <div style={{ padding: '1rem', color: 'var(--color-destructive)' }}>{error}</div>}

      {!loading && layouts.length === 0 && (
        <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No layouts here yet. <Link href={newHref}>Create your first layout</Link>.
        </div>
      )}

      {!loading && layouts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {layouts.map((layout) => (
            <div key={layout.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: 'var(--color-bg-subtle)', padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                <LayoutPreview type={layout.type} data={layout.builderData} height={88} />
              </div>
              <div style={{ padding: '1rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{layout.name}</h3>
                  <TypeBadge type={layout.type} />
                  <StatusBadge status={layout.status} />
                </div>
                {layout.description && <p style={{ margin: '0 0 0.5rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{layout.description}</p>}
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{conditionSummary(layout)}</p>
              </div>
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link href={`/${adminPath}/layouts/${layout.id}`} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Edit</Link>
                <a href={`/layout-preview/${layout.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Preview</a>
                <button onClick={() => handleDuplicate(layout.id)} disabled={duplicatingId !== null} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>
                  {duplicatingId === layout.id ? 'Duplicating…' : 'Duplicate'}
                </button>
                <button onClick={() => handleDelete(layout.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-destructive)', fontSize: 'var(--text-sm)', cursor: 'pointer', padding: '0.375rem 0' }}>
                  Delete
                </button>
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
      {TYPE_LABELS[type] ?? moduleLayoutTypeToGroup[type]?.label ?? type}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') return <span className="badge badge-green" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Published</span>
  return <span className="badge badge-yellow" style={{ padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Draft</span>
}
