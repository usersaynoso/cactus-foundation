'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAdminPath } from '@/components/admin/AdminPathContext'
import { TabStrip } from '@/components/admin/TabStrip'
import { LayoutPreview } from '@/components/admin/LayoutPreview'
import { moduleLayoutTypeToGroup } from '@/lib/layout/module-layout-types'
import { useModuleLayoutGroups } from '@/components/admin/ModuleLayoutGroupsContext'
import { CORE_TYPE_TABS, moduleGroupTabs, TYPE_LABELS, type LayoutTypeTab } from '@/lib/layout/layout-type-tabs'
import { isCompleteRule, type ConditionRule } from '@/lib/layout/displayConditions'

type Layout = {
  id: string
  name: string
  type: string
  description: string | null
  status: string
  builderData: unknown
  displayConditions: { include?: ConditionRule[] } | null
  createdAt: string
}

const ALL_TAB: LayoutTypeTab = { key: 'all', label: 'All', type: null }

/** The include rules that would actually put this layout on a page. A rule the
 * owner added and never finished (a "specific page" with no page picked) shows
 * on nothing, so it does not count towards being live. */
function usableRules(layout: Layout): ConditionRule[] {
  return (layout.displayConditions?.include ?? []).filter(isCompleteRule)
}

function isLive(layout: Layout): boolean {
  return layout.status === 'published' && usableRules(layout).length > 0
}

function conditionSummary(layout: Layout): string {
  const rules = usableRules(layout)
  if (layout.status === 'draft') {
    return rules.length ? 'Draft - not shown until you publish it' : 'Draft - no conditions set'
  }
  if (!rules.length) return 'Published, but shown nowhere - set a condition'
  if (rules.some(r => r.type === 'entire_site')) return 'Entire site'
  if (rules.some(r => r.type === 'homepage')) return 'Homepage'
  if (rules.some(r => r.type === 'not_found')) return '404 pages'
  const hasComingSoon = rules.some(r => r.type === 'coming_soon')
  const hasMaintenance = rules.some(r => r.type === 'maintenance')
  if (hasComingSoon && hasMaintenance) return 'Coming soon + Maintenance'
  if (hasComingSoon) return 'Coming soon'
  if (hasMaintenance) return 'Maintenance'
  return `${rules.length} condition${rules.length === 1 ? '' : 's'}`
}

export default function LayoutBuilderPage() {
  const adminPath = useAdminPath()
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeParam = searchParams.get('type')

  // Only the modules this site has installed. The generated list behind these is
  // every module the build cloned, which is not the same thing - see
  // components/admin/ModuleLayoutGroupsContext.
  const moduleGroups = useModuleLayoutGroups()
  const tabs = useMemo(
    () => [ALL_TAB, ...CORE_TYPE_TABS, ...moduleGroupTabs(moduleGroups)],
    [moduleGroups],
  )

  const initialTop = tabs.some((t) => t.key === typeParam) ? typeParam! : 'all'
  const [activeTop, setActiveTop] = useState<string>(initialTop)
  const [activeModuleSub, setActiveModuleSub] = useState<string | null>(null)
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Layout | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Clicking through tabs quickly used to leave whichever response happened to
  // land last on screen, under whichever tab was open by then. Only the newest
  // request is allowed to write to state.
  const requestRef = useRef(0)

  const activeGroup = moduleGroups.find((g) => g.moduleName === activeTop) ?? null
  const activeType = activeGroup
    ? (activeModuleSub ?? activeGroup.types[0]?.key ?? null)
    : (tabs.find(t => t.key === activeTop)?.type ?? null)

  // The picker opens on whichever type is in view, so "+ New Layout" from the
  // Footer tab starts you on footers.
  const newHref = activeType
    ? `/${adminPath}/layouts/new?type=${activeType}`
    : `/${adminPath}/layouts/new`

  function reload(type: string | null) {
    const token = ++requestRef.current
    setLoading(true)
    const url = type ? `/api/admin/layouts?type=${type}` : '/api/admin/layouts'
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (token !== requestRef.current) return
        setLayouts(d.layouts ?? [])
        setError(d.error ?? '')
        setLoading(false)
      })
      .catch(() => {
        if (token !== requestRef.current) return
        setError('Failed to load layouts')
        setLoading(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload sets loading flag before async fetch; standard data-load pattern
    reload(activeType)
  }, [activeType])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return layouts
    return layouts.filter((l) =>
      l.name.toLowerCase().includes(term) || (l.description ?? '').toLowerCase().includes(term),
    )
  }, [layouts, search])

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

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/layouts/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to delete layout')
      }
      setDeleteTarget(null)
      reload(activeType)
    } catch {
      setError('Failed to delete layout')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      {deleteTarget && (
        <DeleteDialog
          layout={deleteTarget}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Layouts</h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '0.25rem 0 0', fontSize: 'var(--text-base)' }}>Create typed layouts for headers, footers, pages, and status screens.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search layouts…"
            aria-label="Search layouts"
            style={{
              padding: '0.5rem 0.75rem', minWidth: 200,
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)', color: 'var(--color-text)',
              fontSize: 'var(--text-sm)', fontFamily: 'inherit',
            }}
          />
          <Link href={newHref} className="btn btn-primary">+ New Layout</Link>
        </div>
      </div>

      <TabStrip
        style={{ marginBottom: activeGroup ? '0.75rem' : '1.5rem' }}
        items={tabs.map((tab) => ({ key: tab.key, label: tab.label, active: activeTop === tab.key, onClick: () => handleTopClick(tab.key) }))}
        trailing={!loading && layouts.length > 0
          ? <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
              {visible.length} of {layouts.length}
            </span>
          : undefined}
      />

      {activeGroup && (
        <TabStrip
          style={{ marginBottom: '1.5rem' }}
          items={activeGroup.types.map((t) => ({ key: t.key, label: t.label, active: activeType === t.key, onClick: () => setActiveModuleSub(t.key) }))}
        />
      )}

      {loading && <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading…</div>}
      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}

      {!loading && layouts.length === 0 && (
        <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No layouts here yet. <Link href={newHref}>Create your first layout</Link>.
        </div>
      )}

      {!loading && layouts.length > 0 && visible.length === 0 && (
        <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Nothing here matches “{search.trim()}”.
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {visible.map((layout) => (
            <div key={layout.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: 'var(--color-bg-subtle)', padding: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
                <LayoutPreview type={layout.type} data={layout.builderData} height={88} />
              </div>
              <div style={{ padding: '1rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                    <Link href={`/${adminPath}/layouts/${layout.id}`} style={{ color: 'var(--color-text)', textDecoration: 'none' }}>
                      {layout.name}
                    </Link>
                  </h3>
                  <TypeBadge type={layout.type} />
                  <StatusBadge layout={layout} />
                </div>
                {layout.description && <p style={{ margin: '0 0 0.5rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>{layout.description}</p>}
                <p style={{
                  margin: 0, fontSize: '0.8125rem',
                  color: layout.status === 'published' && !usableRules(layout).length ? 'var(--color-warning)' : 'var(--color-muted)',
                }}>
                  {conditionSummary(layout)}
                </p>
              </div>
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Link href={`/${adminPath}/layouts/${layout.id}`} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Edit</Link>
                <a href={`/layout-preview/${layout.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Preview</a>
                <button onClick={() => handleDuplicate(layout.id)} disabled={duplicatingId !== null} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>
                  {duplicatingId === layout.id ? 'Duplicating…' : 'Duplicate'}
                </button>
                <button onClick={() => setDeleteTarget(layout)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-destructive)', fontSize: 'var(--text-sm)', cursor: 'pointer', padding: '0.375rem 0', fontFamily: 'inherit' }}>
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

/** Deleting the header that is on every page of a live site is a big enough deal
 * to say so out loud, and a browser confirm() box cannot. */
function DeleteDialog({ layout, deleting, onCancel, onConfirm }: {
  layout: Layout
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const live = isLive(layout)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete layout"
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', maxWidth: 420, width: '90%' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Delete “{layout.name}”?</h3>
        {live ? (
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            This layout is live: {conditionSummary(layout).toLowerCase()}. Deleting it changes what visitors see straight away.
          </div>
        ) : (
          <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            This cannot be undone.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
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

function StatusBadge({ layout }: { layout: Layout }) {
  const badgeStyle = { padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 } as const
  if (isLive(layout)) return <span className="badge badge-green" style={badgeStyle}>Live</span>
  // Published with nothing to show it on. It is not live, whatever the column says.
  if (layout.status === 'published') return <span className="badge badge-red" style={badgeStyle}>Not shown</span>
  return <span className="badge badge-yellow" style={badgeStyle}>Draft</span>
}
