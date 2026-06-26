'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAdminPath } from '@/components/admin/AdminPathContext'

type Layout = {
  id: string
  name: string
  description: string | null
  status: string
  isStarter: boolean
  createdAt: string
}

type LayoutsData = {
  layouts: Layout[]
  defaultLayoutId: string | null
  moduleDefaults: Array<{ moduleName: string; layoutId: string; layout: { id: string; name: string } }>
}

export default function LayoutsListPage() {
  const adminPath = useAdminPath()
  const [data, setData] = useState<LayoutsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [setDefault, setSetDefault] = useState<string | null>(null)

  const reload = () => {
    fetch('/api/admin/layouts')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load layouts'); setLoading(false) })
  }

  useEffect(reload, [])

  async function handleSetSiteDefault(id: string) {
    setSetDefault(id)
    try {
      await fetch('/api/admin/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultLayoutId: id }),
      })
      reload()
    } catch { setError('Failed to set default') }
    finally { setSetDefault(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this layout? This cannot be undone.')) return
    try {
      await fetch(`/api/admin/layouts/${id}`, { method: 'DELETE' })
      reload()
    } catch { setError('Failed to delete layout') }
  }

  if (loading) return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading…</div>
  if (error) return <div style={{ padding: '2rem', color: '#dc2626' }}>{error}</div>
  if (!data) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Layouts</h1>
          <p style={{ color: '#6b7280', margin: '0.25rem 0 0', fontSize: '0.9375rem' }}>Define reusable page body structures with a ContentSlot for page content.</p>
        </div>
        <Link href={`/${adminPath}/layouts/new`} className="btn btn-primary">+ New Layout</Link>
      </div>

      {data.layouts.length === 0 ? (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
          No layouts yet. <Link href={`/${adminPath}/layouts/new`}>Create your first layout</Link>.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {data.layouts.map((layout) => (
            <div key={layout.id} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ background: '#f9fafb', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e5e7eb' }}>
                <LayoutThumbnail name={layout.name} />
              </div>
              <div style={{ padding: '1rem', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{layout.name}</h3>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {layout.status === 'published' && <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Published</span>}
                    {layout.status === 'draft' && <span style={{ background: '#fef9c3', color: '#a16207', padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Draft</span>}
                    {data.defaultLayoutId === layout.id && <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500 }}>Site Default</span>}
                    {layout.isStarter && <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.75rem' }}>Starter</span>}
                  </div>
                </div>
                {layout.description && <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>{layout.description}</p>}
              </div>
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/${adminPath}/layouts/${layout.id}`} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>Edit</Link>
                {data.defaultLayoutId !== layout.id && (
                  <button className="btn btn-secondary" onClick={() => handleSetSiteDefault(layout.id)} disabled={setDefault === layout.id} style={{ fontSize: '0.8125rem', padding: '0.375rem 0.875rem' }}>
                    Set as Default
                  </button>
                )}
                {!layout.isStarter && (
                  <button onClick={() => handleDelete(layout.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: '0.8125rem', cursor: 'pointer', padding: '0.375rem 0' }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.moduleDefaults.length > 0 && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1.5rem', marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem' }}>Module Layout Defaults</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600, color: '#6b7280' }}>Module</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600, color: '#6b7280' }}>Layout</th>
              </tr>
            </thead>
            <tbody>
              {data.moduleDefaults.map((md) => (
                <tr key={md.moduleName} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.5rem 0', color: '#374151' }}>{md.moduleName}</td>
                  <td style={{ padding: '0.5rem 0', color: '#374151' }}>{md.layout.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LayoutThumbnail({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n.includes('sidebar') && (n.includes('right') || n.includes('70'))) {
    return <div style={{ display: 'flex', gap: 4, height: 44 }}><div style={{ flex: 7, background: '#dbeafe', borderRadius: 3 }} /><div style={{ flex: 3, background: '#f3f4f6', borderRadius: 3 }} /></div>
  }
  if (n.includes('sidebar') && n.includes('left')) {
    return <div style={{ display: 'flex', gap: 4, height: 44 }}><div style={{ flex: 3, background: '#f3f4f6', borderRadius: 3 }} /><div style={{ flex: 7, background: '#dbeafe', borderRadius: 3 }} /></div>
  }
  if (n.includes('boxed') || n.includes('centred') || n.includes('centered')) {
    return <div style={{ display: 'flex', justifyContent: 'center', height: 44 }}><div style={{ width: '70%', background: '#dbeafe', borderRadius: 3 }} /></div>
  }
  return <div style={{ width: '90%', height: 44, background: '#dbeafe', borderRadius: 3 }} />
}
