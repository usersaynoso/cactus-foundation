'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { generateSlug } from '@/lib/utils'

export default function EditPagePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [body, setBody] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/pages/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setTitle(d.title ?? '')
        setSlug(d.slug ?? '')
        setBody(d.body ?? '')
        setMetaDescription(d.metaDescription ?? '')
        setStatus(d.status ?? 'draft')
      })
      .catch(() => setError('Failed to load page'))
  }, [id])

  async function handleSave() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, body, metaDescription, status }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/pages/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to delete')
      }
      router.push(`/${adminPath}/pages`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-header">
        <h1 className="page-title">Edit Page</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
            style={{ padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: 6, fontFamily: 'inherit' }}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button className="btn btn-primary" disabled={loading} onClick={handleSave}>
            {loading ? 'Saving…' : 'Save'}
          </button>
          {deleteConfirm ? (
            <button className="btn btn-danger" onClick={handleDelete}>Confirm delete</button>
          ) : (
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(true)}>Delete</button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Slug</label>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        <span className="field-hint">URL: <code>/{slug}</code></span>
      </div>
      <div className="field">
        <label>Body (Markdown)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={20}
          style={{ fontFamily: 'monospace', fontSize: '0.9375rem' }}
        />
      </div>
      <div className="field">
        <label>Meta description</label>
        <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
      </div>
    </div>
  )
}
