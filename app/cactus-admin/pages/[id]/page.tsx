'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Data } from '@puckeditor/core'
import { generateSlug } from '@/lib/utils'

// Lazy-load the Puck editor — only ships to client when builder mode is active.
// ssr: false because Puck relies on browser APIs (drag-and-drop, ResizeObserver).
const PuckEditor = dynamic(() => import('./PuckEditor'), { ssr: false, loading: () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--color-text-muted)' }}>
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
  publishedData: Data | null
  metaDescription: string | null
  ogImageId: string | null
  status: 'draft' | 'published'
  menuIds: string[]
}

// Restoring an old version writes the draft (builderData) but never touches what's
// live (publishedData), so a page can legitimately open with nothing edited yet still
// have something to publish. Both blobs are written by the same server-side
// normalisation and stored as jsonb (which orders keys deterministically), so a
// stringify comparison is a fair one. Only meaningful once a page is live: for a
// draft page, Update simply saves the content.
function hasUnpublishedDraft(page: PageData): boolean {
  if (page.status !== 'published') return false
  return JSON.stringify(page.builderData) !== JSON.stringify(page.publishedData)
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
      <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>
        {error || 'Loading…'}
      </div>
    )
  }

  const initialData = buildInitialPuckData(page)

  return (
    <>
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', maxWidth: 400, width: '90%' }}>
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
        hasUnpublishedDraft={hasUnpublishedDraft(page)}
        backHref={`/${adminPath}/pages`}
        onDeleteClick={() => setDeleteConfirm(true)}
        deleting={loading}
      />
    </>
  )
}
