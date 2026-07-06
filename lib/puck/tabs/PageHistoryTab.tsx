'use client'

type HistoryVersion = {
  index: 'live' | number
  at: string | null
  title: string
  byName: string | null
  isLive: boolean
}

type Props = {
  versions: HistoryVersion[]
  loading: boolean
  error: string
  restoringIndex: 'live' | number | null
  onRestore: (index: 'live' | number) => void
}

function formatAt(at: string | null): string {
  if (!at) return 'Unknown date'
  try {
    return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return at
  }
}

export default function PageHistoryTab({ versions, loading, error, restoringIndex, onRestore }: Props) {
  return (
    <div>
      <div style={{ fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.6875rem' }}>
        Version history
      </div>

      {loading && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>Loading…</p>
      )}
      {error && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-destructive)' }}>{error}</p>
      )}
      {!loading && !error && versions.length === 0 && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>No published versions yet.</p>
      )}

      {versions.map((v) => (
        <div
          key={String(v.index)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.6rem 0',
            borderBottom: '1px solid var(--color-border)',
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: v.isLive ? 600 : 400 }}>{v.title}</span>
            {v.isLive && (
              <span style={{ marginLeft: '0.4rem', padding: '0.1rem 0.4rem', borderRadius: 3, background: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600 }}>
                Live
              </span>
            )}
            <div style={{ color: 'var(--color-muted)', marginTop: '0.15rem', fontSize: '0.75rem' }}>
              {formatAt(v.at)}{v.byName ? ` · ${v.byName}` : ''}
            </div>
          </div>
          <button
            onClick={() => onRestore(v.index)}
            disabled={restoringIndex !== null}
            style={{
              padding: '0.2rem 0.65rem',
              borderRadius: 4,
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
              fontSize: '0.75rem',
              cursor: restoringIndex !== null ? 'not-allowed' : 'pointer',
              opacity: restoringIndex === v.index ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {restoringIndex === v.index ? 'Loading…' : 'Load into editor'}
          </button>
        </div>
      ))}
    </div>
  )
}
