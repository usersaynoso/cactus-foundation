'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ABOUT, CREDITS } from '@/lib/about/credits'
import type { ReleaseNoteItem } from '@/lib/updates/core'

type Props = {
  version: string
  onClose: () => void
}

// Shared overlay backdrop. Clicking outside the card closes it.
function Overlay({ zIndex, onClose, children }: { zIndex: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      // isolation: 'isolate' pins this overlay to its own stacking context, so
      // its z-index always wins against page chrome regardless of ambient
      // z-index elsewhere in the admin shell.
      style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', isolation: 'isolate' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '1.5rem', lineHeight: 1, color: 'var(--color-text-muted)' }}
    >
      ×
    </button>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--admin-radius-lg)',
  boxShadow: 'var(--shadow-elevated)',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  // Clip header/body/footer to the card's rounded corners so nothing overhangs
  // past the border and reveals the page underneath.
  overflow: 'hidden',
}

export default function AboutModal({ version, onClose }: Props) {
  const [showReleases, setShowReleases] = useState(false)
  // useSyncExternalStore returns false on the server and true on the client,
  // the React-idiomatic way to gate createPortal without a setState-in-effect.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  // Escape closes the topmost layer (release notes first, then the about card).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (showReleases) setShowReleases(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showReleases, onClose])

  if (!mounted) return null

  // Portals to document.body: AdminNav mounts this inside .admin-sidebar,
  // which is `position: sticky` and therefore its own stacking context. A
  // fixed-position overlay nested in there still paints within that
  // context, so <main> (later in the DOM, its own top-level stacking
  // context) painted over it regardless of z-index - the dialog's header
  // showed the page's own tab strip bleeding through. Portalling escapes
  // the sidebar's stacking context entirely, matching NotificationBell.
  return createPortal(
    <Overlay zIndex={80} onClose={onClose}>
      <div style={{ ...cardStyle, maxWidth: 640, maxHeight: '85vh' }} role="dialog" aria-modal="true" aria-label="About Cactus Foundation">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cactus.svg" alt="" width={44} height={44} style={{ flexShrink: 0, borderRadius: 'var(--radius-md)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text)' }}>{ABOUT.name}</h2>
            <p style={{ margin: '0.125rem 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{ABOUT.slogan}</p>
          </div>
          <span style={{ alignSelf: 'flex-start', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>v{version}</span>
          <div style={{ alignSelf: 'flex-start' }}><CloseButton onClose={onClose} /></div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', background: 'var(--color-bg)' }}>
          <p style={{ margin: '0 0 1.5rem', fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
            {ABOUT.paragraph}
          </p>

          <h3 style={{ margin: '0 0 0.25rem', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Credits</h3>
          <p style={{ margin: '0 0 1rem', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Cactus stands on the shoulders of these open-source projects. Cheers to all of them.
          </p>

          {CREDITS.map((group) => (
            <div key={group.title} style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
                {group.title}
              </h4>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {group.entries.map((entry) => (
                  <li key={entry.name} style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {entry.name}
                    </a>
                    <span style={{ color: 'var(--color-text-secondary)' }}> - {entry.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => setShowReleases(true)}>Release notes</button>
        </div>
      </div>

      {showReleases && <ReleaseNotesModal onClose={() => setShowReleases(false)} />}
    </Overlay>,
    document.body
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Release history with infinite scroll: fetches one page at a time from
// /api/admin/release-notes and appends as the user nears the bottom.
function ReleaseNotesModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ReleaseNoteItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  // Guards against a stale in-flight request appending after another already did.
  const loadingRef = useRef(false)

  const loadPage = useCallback(async (next: number) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/release-notes?page=${next}`)
      if (!res.ok) throw new Error('Request failed')
      const data = (await res.json()) as { items: ReleaseNoteItem[]; hasMore: boolean }
      setItems((prev) => [...prev, ...data.items])
      setHasMore(data.hasMore)
      setPage(next)
    } catch {
      setError("Couldn't load release notes. Please try again.")
      setHasMore(false)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  // Initial page. Fetching on mount is the intended use of an effect; the
  // setState it triggers is the async result, not a synchronous cascade.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- on-mount data fetch, state reflects the load/result
  useEffect(() => { void loadPage(1) }, [loadPage])

  // Load the next page when the scroll position nears the bottom.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || loadingRef.current || !hasMore) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
      void loadPage(page + 1)
    }
  }, [hasMore, page, loadPage])

  return (
    <Overlay zIndex={90} onClose={onClose}>
      <div style={{ ...cardStyle, maxWidth: 640, height: '85vh' }} role="dialog" aria-modal="true" aria-label="Release notes">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text)' }}>Release notes</h2>
          <CloseButton onClose={onClose} />
        </div>

        <div ref={scrollRef} onScroll={onScroll} style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', flex: 1, background: 'var(--color-bg)' }}>
          {items.map((item) => (
            <article key={item.tag} style={{ paddingBottom: '1.25rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>v{item.version}</h3>
                {item.publishedAt && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{formatDate(item.publishedAt)}</span>
                )}
              </div>
              {item.html ? (
                <div className="about-release-body" style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--color-text-secondary)' }} dangerouslySetInnerHTML={{ __html: item.html }} />
              ) : (
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No notes for this release.</p>
              )}
            </article>
          ))}

          {loading && (
            <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>Loading…</p>
          )}
          {error && (
            <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>{error}</p>
          )}
          {!loading && !error && !hasMore && items.length > 0 && (
            <p style={{ textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>That&rsquo;s the lot - every release, all the way back.</p>
          )}
          {!loading && !error && items.length === 0 && (
            <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>No release notes to show yet.</p>
          )}
        </div>
      </div>
    </Overlay>
  )
}
