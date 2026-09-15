'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchSourceKey } from '@/modules/search/lib/types'

type StatusSource = {
  key: SearchSourceKey
  label: string
  available: boolean
  enabled: boolean
  documentCount: number
  lastIndexedAt: string | null
}
type Status = { sources: StatusSource[]; totalDocuments: number; lastRunAt: string | null }
type Analytics = {
  top: Array<{ query: string; searches: number; avgResults: number }>
  zeroResults: Array<{ query: string; searches: number }>
  volume: Array<{ day: string; searches: number }>
}
type RunResult = { done: boolean; cursor: { source: SearchSourceKey; offset: number } | null; processed: number; deleted: number; errors: string[] }

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)', borderRadius: 10, padding: '1rem',
  background: 'var(--color-surface)', marginBottom: '1rem',
}
const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.05em', color: 'var(--color-text-secondary)', padding: '.375rem .5rem',
  borderBottom: '1px solid var(--color-border)',
}
const tdStyle: React.CSSProperties = { fontSize: '.8125rem', padding: '.375rem .5rem', borderBottom: '1px solid var(--color-border)' }

function formatWhen(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function SearchDashboard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [rebuilding, setRebuilding] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ processed: number; deleted: number } | null>(null)
  const [runErrors, setRunErrors] = useState<string[]>([])
  const cancelRef = useRef(false)
  const autoStartedRef = useRef(false)

  const refresh = useCallback(() => {
    Promise.all([
      fetch('/api/m/search/admin/status'),
      fetch('/api/m/search/admin/queries'),
    ]).then(async ([statusRes, analyticsRes]) => {
      if (statusRes.status === 403 || statusRes.status === 401) {
        setForbidden(true)
        return
      }
      setStatus(await statusRes.json())
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json())
    }).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Loops the batched reindex endpoint with its cursor until done - each call
  // stays inside the 60s module-route ceiling.
  const rebuild = async (sources?: SearchSourceKey[]) => {
    const key = sources?.join(',') ?? 'all'
    setRebuilding(key)
    setProgress({ processed: 0, deleted: 0 })
    setRunErrors([])
    cancelRef.current = false
    let cursor: RunResult['cursor'] = null
    let totals = { processed: 0, deleted: 0 }
    try {
      for (let guard = 0; guard < 500; guard++) {
        if (cancelRef.current) break
        const res = await fetch('/api/m/search/admin/reindex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: true, sources, cursor }),
        })
        if (!res.ok) {
          setRunErrors([`Rebuild failed (${res.status})`])
          break
        }
        const result = (await res.json()) as RunResult
        totals = { processed: totals.processed + result.processed, deleted: totals.deleted + result.deleted }
        setProgress(totals)
        if (result.errors.length) setRunErrors(result.errors)
        if (result.done) break
        cursor = result.cursor
      }
    } catch {
      setRunErrors(['Rebuild failed - network error.'])
    } finally {
      setRebuilding(null)
      refresh()
    }
  }

  // First visit on a fresh install: the index is empty and nothing can be
  // found until it is built, so build it - no button hunt required. This is
  // also what the "Search index needs building" bell notification lands on.
  useEffect(() => {
    if (!status || autoStartedRef.current || rebuilding !== null) return
    if (status.totalDocuments !== 0) return
    autoStartedRef.current = true
    const t = setTimeout(() => rebuild(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild is stable per mount; guarding via refs
  }, [status])

  if (forbidden) {
    return <div className="alert alert-danger">You need the search permission to view this page.</div>
  }
  if (!status) return null

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{status.totalDocuments.toLocaleString()} items in the index</div>
            <div style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)' }}>
              Last automatic run: {formatWhen(status.lastRunAt)} · refreshed nightly, or rebuild any time
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            {rebuilding && (
              <button className="btn" onClick={() => { cancelRef.current = true }}>Stop</button>
            )}
            <button className="btn btn-primary" onClick={() => rebuild()} disabled={rebuilding !== null}>
              {rebuilding === 'all' ? `Rebuilding… ${progress?.processed ?? 0} done` : 'Rebuild index'}
            </button>
          </div>
        </div>
        {runErrors.length > 0 && (
          <div className="alert alert-danger" style={{ marginTop: '.75rem' }}>
            {runErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 .5rem', fontSize: '.9375rem' }}>Content types</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Indexed</th>
              <th style={thStyle}>Last indexed</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {status.sources.filter((s) => s.available).map((s) => (
              <tr key={s.key}>
                <td style={tdStyle}>
                  {s.label}
                  {!s.enabled && <span style={{ marginLeft: '.5rem', fontSize: '.6875rem', color: 'var(--color-text-secondary)' }}>(switched off in Settings)</span>}
                </td>
                <td style={tdStyle}>{s.documentCount.toLocaleString()}</td>
                <td style={tdStyle}>{formatWhen(s.lastIndexedAt)}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button
                    className="btn"
                    style={{ fontSize: '.75rem' }}
                    onClick={() => rebuild([s.key])}
                    disabled={rebuilding !== null || !s.enabled}
                  >
                    {rebuilding === s.key ? 'Rebuilding…' : 'Reindex'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 .5rem', fontSize: '.9375rem' }}>Top searches (30 days)</h3>
            {analytics.top.length === 0 ? (
              <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>Nothing logged yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={thStyle}>Term</th><th style={thStyle}>Searches</th><th style={thStyle}>Avg results</th></tr>
                </thead>
                <tbody>
                  {analytics.top.map((r) => (
                    <tr key={r.query}>
                      <td style={tdStyle}>{r.query}</td>
                      <td style={tdStyle}>{r.searches}</td>
                      <td style={tdStyle}>{r.avgResults}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 .5rem', fontSize: '.9375rem' }}>Searches with no results (30 days)</h3>
            <p style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)', margin: '0 0 .5rem' }}>
              What visitors wanted and could not find - the most useful list on this page.
            </p>
            {analytics.zeroResults.length === 0 ? (
              <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>None - everything found something.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><th style={thStyle}>Term</th><th style={thStyle}>Searches</th></tr>
                </thead>
                <tbody>
                  {analytics.zeroResults.map((r) => (
                    <tr key={r.query}>
                      <td style={tdStyle}>{r.query}</td>
                      <td style={tdStyle}>{r.searches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
