'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import { generateSlug } from '@/lib/utils'

// Lazy-load the Puck editor — only ships to client when builder mode is active.
// ssr: false because Puck relies on browser APIs (drag-and-drop, ResizeObserver).
const PuckEditor = dynamic(() => import('./PuckEditor'), { ssr: false, loading: () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#6b7280' }}>
    Loading builder…
  </div>
) })

type PageData = {
  id: string
  title: string
  slug: string
  body: string
  bodyFormat: 'markdown' | 'builder'
  builderData: Data | null
  metaDescription: string | null
  ogImageId: string | null
  status: 'draft' | 'published'
  menuIds: string[]
}

function buildInitialPuckData(page: PageData): Data {
  // Reconciliation: always overwrite root.props with canonical DB columns.
  // A stale blob from a previous session must never win over real column values.
  const stored = page.builderData ?? { content: [], root: { props: {} }, zones: {} }
  return {
    ...stored,
    root: {
      ...stored.root,
      props: {
        ...(stored.root?.props ?? {}),
        title:           page.title,
        slug:            page.slug,
        status:          page.status,
        metaDescription: page.metaDescription ?? '',
        ogImageId:       page.ogImageId ?? '',
        menuIds:         page.menuIds ?? [],
      },
    },
  } as Data
}

export default function EditPagePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''

  const [page, setPage] = useState<PageData | null>(null)
  const [bodyFormat, setBodyFormat] = useState<'markdown' | 'builder'>('markdown')

  // Markdown editor state
  const [title, setTitle] = useState('')
  const [slug, setSlug]   = useState('')
  const [body, setBody]   = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')

  const [menuIds, setMenuIds] = useState<string[]>([])
  const [menus, setMenus]   = useState<{ id: string; name: string }[]>([])
  const [canPublish, setCanPublish] = useState(false)
  const [canManageMenus, setCanManageMenus] = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [switchConfirm, setSwitchConfirm] = useState<'markdown' | 'builder' | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/pages/${id}`).then((r) => r.json()),
      fetch('/api/admin/pages/perms').then((r) => r.ok ? r.json() : { canPublish: false, canManageMenus: false }).catch(() => ({ canPublish: false, canManageMenus: false })),
      fetch('/api/admin/menus').then((r) => r.ok ? r.json() : { menus: [] }).catch(() => ({ menus: [] })),
    ]).then(([d, perms, menusData]) => {
      setPage(d)
      setBodyFormat(d.bodyFormat ?? 'markdown')
      setTitle(d.title ?? '')
      setSlug(d.slug ?? '')
      setBody(d.body ?? '')
      setMetaDescription(d.metaDescription ?? '')
      setStatus(d.status ?? 'draft')
      setMenuIds(d.menuIds ?? [])
      setCanPublish(perms.canPublish ?? false)
      setCanManageMenus(perms.canManageMenus ?? false)
      setMenus((menusData as { menus?: { id: string; name: string }[] }).menus ?? [])
    }).catch(() => setError('Failed to load page'))
  }, [id])

  async function handleMarkdownSave() {
    setError('')
    setLoading(true)
    try {
      const body_payload: Record<string, unknown> = { title, slug, body, metaDescription, status }
      if (canManageMenus) body_payload.menuIds = menuIds
      const res = await fetch(`/api/admin/pages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body_payload),
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

  async function confirmFormatSwitch(to: 'markdown' | 'builder') {
    setSwitchConfirm(null)
    // Persist the format change immediately so a page reload remembers it.
    // For markdown→builder, body content stays; for builder→markdown, builderData stays.
    await fetch(`/api/admin/pages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bodyFormat: to }),
    })
    // Refresh page data so PuckEditor gets fresh reconciled initial data
    const updated = await fetch(`/api/admin/pages/${id}`).then((r) => r.json())
    setPage(updated)
    setBodyFormat(to)
  }

  if (!page) {
    return (
      <div style={{ padding: '2rem', color: '#6b7280' }}>
        {error || 'Loading…'}
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Builder mode — Puck takes the full screen
  // -----------------------------------------------------------------------
  if (bodyFormat === 'builder') {
    const initialData = buildInitialPuckData(page)
    return (
      <>
        {/* Slim back + format switcher bar above the full-screen Puck editor */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
          zIndex: 100,
          position: 'relative',
        }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => router.push(`/${adminPath}/pages`)}
          >
            ← Pages
          </button>
          <strong style={{ fontSize: '0.875rem', color: '#111827', flex: 1 }}>{page.title}</strong>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSwitchConfirm('markdown')}
          >
            Switch to Markdown
          </button>
          <button
            className="btn btn-danger btn-sm"
            disabled={loading}
            onClick={() => setDeleteConfirm(true)}
          >
            Delete
          </button>
        </div>

        {switchConfirm === 'markdown' && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 440, width: '90%' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Switch to Markdown?</h3>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
                Your builder content will be saved but the page will revert to the Markdown editor.
                You can switch back to Builder at any time.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setSwitchConfirm(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => confirmFormatSwitch('markdown')}>Switch</button>
              </div>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 400, width: '90%' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Delete this page?</h3>
              {error && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setDeleteConfirm(false); setError('') }}>Cancel</button>
                <button className="btn btn-danger" disabled={loading} onClick={handleDelete}>Delete</button>
              </div>
            </div>
          </div>
        )}

        <PuckEditor
          pageId={id}
          initialData={initialData}
          canPublish={canPublish}
          canManageMenus={canManageMenus}
        />
      </>
    )
  }

  // -----------------------------------------------------------------------
  // Markdown mode — existing editor
  // -----------------------------------------------------------------------
  return (
    <div style={{ maxWidth: 800 }}>
      <div className="page-header">
        <h1 className="page-title">Edit Page</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSwitchConfirm('builder')}
          >
            Switch to Builder
          </button>
          {canPublish ? (
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
              style={{ padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: 6, fontFamily: 'inherit' }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          ) : (
            <span style={{ padding: '0.5rem 0.75rem', background: '#f3f4f6', borderRadius: 6, fontSize: '0.875rem', color: '#6b7280' }}>
              {status === 'published' ? 'Published' : 'Draft'}
            </span>
          )}
          <button className="btn btn-primary" disabled={loading} onClick={handleMarkdownSave}>
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

      {switchConfirm === 'builder' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '2rem', maxWidth: 440, width: '90%' }}>
            <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Switch to Builder?</h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0 0 1.25rem' }}>
              Your Markdown content will be saved. The visual builder will start empty — you can switch back to Markdown at any time.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSwitchConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => confirmFormatSwitch('builder')}>Switch</button>
            </div>
          </div>
        </div>
      )}

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

      {canManageMenus && menus.length > 0 && (
        <div className="field">
          <label>Show in menus</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {menus.map((menu) => (
              <label key={menu.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="checkbox"
                  checked={menuIds.includes(menu.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setMenuIds((prev) => [...prev, menu.id])
                    } else {
                      setMenuIds((prev) => prev.filter((id) => id !== menu.id))
                    }
                  }}
                />
                {menu.name}
              </label>
            ))}
          </div>
          <span className="field-hint">Saves when you click Save above. Unchecking removes the page from that menu entirely.</span>
        </div>
      )}
    </div>
  )
}
