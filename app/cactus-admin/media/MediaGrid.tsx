'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MediaCard, { type MediaCardItem } from './MediaCard'

type MediaGridProps = {
  items: MediaCardItem[]
  canDelete: boolean
  /** Whether the server has more matching items beyond this first batch. */
  hasMore: boolean
  search: string
  filter: string
  perPage: number
}

// Owns bulk-selection state across the grid (a single MediaCard can't know
// about its siblings), incremental loading of further pages as the user
// scrolls, and the confirm-and-delete flow. Both reset whenever the initial
// item list changes (search, filter).
export default function MediaGrid({ items, canDelete, hasMore, search, filter, perPage }: MediaGridProps) {
  const router = useRouter()
  const [loadedItems, setLoadedItems] = useState<MediaCardItem[]>(items)
  const [page, setPage] = useState(1)
  const [hasMoreState, setHasMoreState] = useState(hasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastToggledIndex, setLastToggledIndex] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [skippedInUse, setSkippedInUse] = useState<{ id: string; references: string[] }[]>([])
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset everything whenever the initial item list itself changes (search,
  // filter) — adjusted during render (React's documented pattern), not in an
  // effect, since a fresh `items` array arrives as a new prop reference on
  // every navigation rather than mutating the same one.
  const itemsKey = items.map((i) => i.id).join(',')
  const [lastItemsKey, setLastItemsKey] = useState(itemsKey)
  if (itemsKey !== lastItemsKey) {
    setLastItemsKey(itemsKey)
    setLoadedItems(items)
    setPage(1)
    setHasMoreState(hasMore)
    setSelected(new Set())
    setSkippedInUse([])
    setLastToggledIndex(null)
  }

  async function loadMore() {
    if (loadingMore || !hasMoreState) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const qs = new URLSearchParams({ page: String(nextPage), perPage: String(perPage) })
      if (search) qs.set('q', search)
      if (filter !== 'all') qs.set('filter', filter)
      const res = await fetch(`/api/admin/media?${qs.toString()}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to load more media')
      setLoadedItems((prev) => [...prev, ...d.items])
      setPage(nextPage)
      setHasMoreState(d.items.length === perPage)
    } catch {
      // Leave hasMoreState as-is so the sentinel simply retries on next scroll.
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMoreState) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore()
    }, { rootMargin: '400px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore closes over page/loadingMore, re-created each render; observer only needs re-attaching when hasMoreState changes
  }, [hasMoreState, page, loadingMore])

  useEffect(() => {
    if (!confirming) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirming(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [confirming])

  function toggleSelect(id: string, shiftKey: boolean) {
    const index = loadedItems.findIndex((i) => i.id === id)

    if (shiftKey && lastToggledIndex !== null) {
      const [start, end] = index < lastToggledIndex ? [index, lastToggledIndex] : [lastToggledIndex, index]
      const rangeIds = loadedItems.slice(start, end + 1).map((i) => i.id)
      setSelected((prev) => {
        const next = new Set(prev)
        rangeIds.forEach((rangeId) => next.add(rangeId))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    setLastToggledIndex(index)
  }

  function itemLabel(id: string): string {
    const item = loadedItems.find((i) => i.id === id)
    return item ? (item.key.split('/').pop() ?? item.key) : id
  }

  async function handleConfirmDelete(force: boolean) {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/media/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), force }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')

      if (d.skipped?.length > 0) {
        // Some items are still referenced elsewhere - leave the confirm dialog
        // open on just those, offering a force-delete instead of silently
        // succeeding on the rest and hiding the conflict.
        setSkippedInUse(d.skipped)
        setSelected(new Set(d.skipped.map((s: { id: string }) => s.id)))
      } else {
        setConfirming(false)
        setSelected(new Set())
      }
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const selectedCount = selected.size

  return (
    <>
      {canDelete && selectedCount > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            marginBottom: '1rem', padding: '0.5rem 0.75rem',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
            background: 'var(--color-bg-subtle)',
          }}
        >
          <span style={{ fontSize: 'var(--text-sm)' }}>{selectedCount} selected</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => { setSkippedInUse([]); setError(''); setConfirming(true) }}>
            Delete selected
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
        {loadedItems.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            canDelete={canDelete}
            selectable={canDelete}
            selected={selected.has(item.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {hasMoreState && (
        <div ref={sentinelRef} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          {loadingMore ? 'Loading more…' : ''}
        </div>
      )}

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm bulk delete"
          onClick={() => { if (!deleting) setConfirming(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(480px, 92vw)', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>
              {skippedInUse.length > 0 ? 'Some items are still in use' : `Delete ${selectedCount} media item${selectedCount === 1 ? '' : 's'}?`}
            </h2>

            {skippedInUse.length > 0 ? (
              <>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  These are referenced elsewhere on the site. Deleting them may break what uses them.
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--text-sm)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {skippedInUse.map((s) => (
                    <li key={s.id}>
                      <strong>{itemLabel(s.id)}</strong>: {s.references.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                This can&apos;t be undone. The files will be removed from storage as well as the media library.
              </p>
            )}

            {error && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-destructive)' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={deleting} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={deleting}
                onClick={() => handleConfirmDelete(skippedInUse.length > 0)}
              >
                {deleting ? 'Deleting…' : skippedInUse.length > 0 ? 'Delete anyway' : 'Confirm delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
