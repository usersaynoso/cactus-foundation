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
  templateId: string | null
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
  const [canPublish, setCanPublish] = useState(false)
  const [canManageMenus, setCanManageMenus] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/pages/${id}`).then((r) => r.json()),
      fetch('/api/admin/pages/perms').then((r) => r.ok ? r.json() : { canPublish: false, canManageMenus: false }).catch(() => ({ canPublish: false, canManageMenus: false })),
    ]).then(async ([d, perms]) => {
      // If this page was in markdown mode, migrate it to builder silently
      if (d.bodyFormat === 'markdown') {
        await fetch(`/api/admin/pages/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bodyFormat: 'builder' }),
        }).catch(() => {})
        d.bodyFormat = 'builder'
      }
      setPage(d)
      setCanPublish(perms.canPublish ?? false)
      setCanManageMenus(perms.canManageMenus ?? false)
    }).catch(() => setError('Failed to load page'))
  }, [id])

  const handleDelete = useCallback(async () => {
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
  }, [id, adminPath, router])

  if (!page) {
    return (
      <div style={{ padding: '2rem', color: '#6b7280' }}>
        {error || 'Loading…'}
      </div>
    )
  }

  const initialData = buildInitialPuckData(page)

  return (
    <>
      {/* Slim back + delete bar above the full-screen Puck editor */}
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
          className="btn btn-danger btn-sm"
          disabled={loading}
          onClick={() => setDeleteConfirm(true)}
        >
          Delete
        </button>
      </div>

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

      {page.templateId && (
        <div style={{
          background: '#ede9fe', padding: '0.5rem 1rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          fontSize: '0.875rem', color: '#5b21b6',
          borderBottom: '1px solid #c4b5fd',
        }}>
          <span>This page is linked to a template.</span>
          <a href={`/${adminPath}/templates/${page.templateId}`} style={{ color: '#7c3aed', fontWeight: 500 }}>Edit template →</a>
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
