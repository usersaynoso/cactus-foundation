'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { generateSlug } from '@/lib/utils'

export default function NewPagePage() {
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [body, setBody] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [bodyFormat, setBodyFormat] = useState<'markdown' | 'builder'>('markdown')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleTitleChange(val: string) {
    setTitle(val)
    if (!slugEdited) setSlug(generateSlug(val))
  }

  async function handleSave() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, slug, body, metaDescription, status, bodyFormat }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to create page')
      if (bodyFormat === 'builder') {
        router.push(`/${adminPath}/pages/${d.id}`)
      } else {
        router.push(`/${adminPath}/pages`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create page')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-header">
        <h1 className="page-title">New Page</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
            style={{ padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: 6, fontFamily: 'inherit' }}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button className="btn btn-primary" disabled={!title || !slug || loading} onClick={handleSave}>
            {loading ? 'Saving…' : bodyFormat === 'builder' ? 'Create & Open Builder' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Page title" autoFocus />
      </div>

      <div className="field">
        <label>Slug</label>
        <input
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugEdited(true) }}
          placeholder="page-slug"
        />
        <span className="field-hint">URL: <code>/{slug}</code></span>
      </div>

      <div className="field">
        <label>Editor</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={bodyFormat === 'markdown' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setBodyFormat('markdown')}
          >
            Markdown
          </button>
          <button
            type="button"
            className={bodyFormat === 'builder' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setBodyFormat('builder')}
          >
            Page Builder
          </button>
        </div>
        {bodyFormat === 'builder' && (
          <span className="field-hint">The page will be created and the visual builder will open immediately.</span>
        )}
      </div>

      {bodyFormat === 'markdown' && (
        <>
          <div className="field">
            <label>Body (Markdown)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              placeholder="Write your page content in Markdown…"
              style={{ fontFamily: 'monospace', fontSize: '0.9375rem' }}
            />
          </div>

          <div className="field">
            <label>Meta description</label>
            <input value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} placeholder="Brief description for search engines (optional)" />
          </div>
        </>
      )}
    </div>
  )
}
