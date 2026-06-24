'use client'
import { useState } from 'react'
import Link from 'next/link'

type Template = {
  id: string
  name: string
  type: 'HEADER' | 'FOOTER' | 'PAGE'
  status: 'draft' | 'published'
  updatedAt: string
}

type Props = {
  templates: Template[]
  adminPath: string
  headerTemplateId: string | null
  footerTemplateId: string | null
}

const TYPE_LABELS: Record<string, string> = { HEADER: 'Header', FOOTER: 'Footer', PAGE: 'Page' }
const TYPE_COLORS: Record<string, string> = { HEADER: '#1d4ed8', FOOTER: '#7c3aed', PAGE: '#059669' }

export default function TemplatesClient({ templates: initial, adminPath, headerTemplateId, footerTemplateId }: Props) {
  const [templates, setTemplates] = useState(initial)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)

  async function handleDuplicate(id: string) {
    setDuplicating(id)
    try {
      const res = await fetch(`/api/admin/templates/${id}/duplicate`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Duplicate failed')
      setTemplates((prev) => [d, ...prev])
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Duplicate failed')
    } finally {
      setDuplicating(null)
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null)
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Templates</h1>
        <Link href={`/${adminPath}/templates/new`} className="btn btn-primary">+ New template</Link>
      </div>

      {deleteError && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {deleteError}
          <button onClick={() => setDeleteError(null)} style={{ marginLeft: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>✕</button>
        </div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Last updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af' }}>No templates yet</td></tr>
            )}
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.name}</strong>
                  {headerTemplateId === t.id && (
                    <span style={{ marginLeft: '0.5rem', background: '#dbeafe', color: '#1d4ed8', fontSize: '0.7rem', fontWeight: 600, padding: '0.125rem 0.375rem', borderRadius: 4 }}>Active Header</span>
                  )}
                  {footerTemplateId === t.id && (
                    <span style={{ marginLeft: '0.5rem', background: '#ede9fe', color: '#7c3aed', fontSize: '0.7rem', fontWeight: 600, padding: '0.125rem 0.375rem', borderRadius: 4 }}>Active Footer</span>
                  )}
                </td>
                <td>
                  <span style={{ background: '#f3f4f6', color: TYPE_COLORS[t.type] ?? '#374151', fontSize: '0.75rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: 4 }}>
                    {TYPE_LABELS[t.type] ?? t.type}
                  </span>
                </td>
                <td>
                  <span className={`badge ${t.status === 'published' ? 'badge-green' : 'badge-gray'}`}>
                    {t.status}
                  </span>
                </td>
                <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {new Date(t.updatedAt).toLocaleDateString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <Link href={`/${adminPath}/templates/${t.id}`} className="btn btn-secondary btn-sm">Edit</Link>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={duplicating === t.id}
                      onClick={() => handleDuplicate(t.id)}
                    >
                      {duplicating === t.id ? '…' : 'Duplicate'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={deleting === t.id}
                      onClick={() => handleDelete(t.id)}
                    >
                      {deleting === t.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
