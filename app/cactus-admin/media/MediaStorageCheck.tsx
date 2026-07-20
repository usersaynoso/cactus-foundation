'use client'

import { useState } from 'react'
import { formatBytes } from './format'
// Type-only - erased at build, so the server-only reconcile module (and its
// prisma import) never reaches the client bundle.
import type { StorageReconcile, PurgeMissingResult } from '@/lib/media/reconcile'

// Storage check. Every other figure on this page is counted from the library's
// own records, so it can only ever agree with itself; this is the one thing that
// asks storage what is really there and reports the difference.
//
// Deliberately on demand rather than part of the page's stat bar: it lists every
// object the storage holds, which is far too slow to sit in front of a page
// render, and it is a maintenance job an admin reaches for rather than a number
// they watch.
export default function MediaStorageCheck({ canDelete }: { canDelete: boolean }) {
  const [state, setState] = useState<'idle' | 'scanning' | 'working'>('idle')
  const [result, setResult] = useState<StorageReconcile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // Entries a purge left alone because something still points at them. Held so
  // the admin can see what they are before deciding to remove them anyway.
  const [blocked, setBlocked] = useState<PurgeMissingResult['skipped']>([])

  const busy = state !== 'idle'

  // `keepNote` is for the re-scan that follows a repair: that scan is part of
  // the repair, so it must not wipe the sentence saying what the repair did.
  async function scan(keepNote = false) {
    setState('scanning'); setError(null); if (!keepNote) { setNote(null); setBlocked([]) }
    try {
      const res = await fetch('/api/admin/media/storage-check')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'The check could not be run.')
      setResult(data as StorageReconcile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not be run.')
    } finally {
      setState('idle')
    }
  }

  async function post(action: string, keys?: string[], force?: boolean) {
    setState('working'); setError(null); setNote(null); setBlocked([])
    try {
      const res = await fetch('/api/admin/media/storage-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, keys, force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'That did not work.')
      if (action === 'correct-sizes') {
        setNote(data.corrected === 0 ? 'Nothing needed correcting.' : `Corrected ${data.corrected} recorded size${data.corrected === 1 ? '' : 's'}.`)
      } else if (action === 'purge-missing') {
        const skipped = (data.skipped ?? []) as PurgeMissingResult['skipped']
        setBlocked(skipped)
        setNote(
          `Removed ${data.purged} entr${data.purged === 1 ? 'y' : 'ies'}.` +
          (skipped.length > 0 ? ` ${skipped.length} left alone for now - still used elsewhere.` : '')
        )
      } else {
        setNote(`Deleted ${data.deleted} file${data.deleted === 1 ? '' : 's'}, freeing ${formatBytes(data.reclaimedBytes)}.${data.skipped > 0 ? ` ${data.skipped} skipped.` : ''}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.')
      setState('idle')
      return
    }
    // Re-scan rather than patching the list in place: the repair is the thing
    // being verified, so the numbers shown afterwards should come from storage.
    await scan(true)
  }

  return (
    <section
      style={{
        marginTop: 'var(--space-6)',
        padding: 'var(--space-4)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>Storage check</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            Compares this library against the files actually held in storage. Finds leftovers taking up
            room, items whose file has gone, and sizes recorded wrongly.
          </p>
        </div>
        <button type="button" onClick={() => void scan()} disabled={busy} style={buttonStyle(false)}>
          {state === 'scanning' ? 'Checking…' : result ? 'Check again' : 'Run check'}
        </button>
      </div>

      {error && <Message tone="danger">{error}</Message>}
      {note && <Message tone="ok">{note}</Message>}

      {result && (
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {result.partial && (
            <Message tone="warn">
              Some storage could not be checked, so this is a partial picture:{' '}
              {result.providers.filter((p) => !p.scanned).map((p) => `${p.provider} - ${p.skippedReason}`).join('; ')}.
            </Message>
          )}

          <Group
            title="Leftover files"
            empty="Nothing left behind. Every file in storage belongs to an item here."
            count={result.orphaned.length}
            summary={`taking up ${formatBytes(result.orphanedBytes)}`}
            action={
              canDelete && result.orphaned.length > 0
                ? {
                    label: state === 'working' ? 'Deleting…' : 'Delete all leftovers',
                    danger: true,
                    onClick: () => {
                      const ok = window.confirm(
                        `Permanently delete ${result.orphaned.length} leftover file${result.orphaned.length === 1 ? '' : 's'} from storage, freeing ${formatBytes(result.orphanedBytes)}?\n\nNothing in this library points at them. This cannot be undone from here.`
                      )
                      if (ok) void post('delete-orphans', result.orphaned.map((o) => o.key))
                    },
                  }
                : undefined
            }
            rows={result.orphaned.map((o) => ({ key: o.key, label: o.key, detail: formatBytes(o.sizeBytes) }))}
          />

          <Group
            title="Files that have gone"
            empty="Every item here has its file."
            count={result.missing.length}
            summary="shown in the library, but not in storage"
            action={
              canDelete && result.missing.length > 0
                ? {
                    label: state === 'working' ? 'Removing…' : 'Remove these entries',
                    danger: true,
                    onClick: () => {
                      const ok = window.confirm(
                        `Remove ${result.missing.length} entr${result.missing.length === 1 ? 'y' : 'ies'} from this library?\n\nTheir files are already gone from storage, so nothing is deleted from storage here - this only clears the entries pointing at them. Anything still used on a page will be listed rather than removed.`
                      )
                      if (ok) void post('purge-missing', result.missing.map((m) => m.key))
                    },
                  }
                : undefined
            }
            rows={result.missing.map((m) => ({ key: m.key, label: m.originalName ?? m.key, detail: m.key }))}
          />

          {/* Message renders a <p>, so this list-and-button block gets its own
              container rather than nesting invalid markup inside one. */}
          {blocked.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-warning)',
              }}
            >
              <span>
                These entries are still used, so they were left alone. Their files have gone either way, so
                whatever points at them is already showing nothing:
              </span>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {blocked.map((b) => (
                  <li key={b.key}>
                    <strong>{b.originalName ?? b.key}</strong> - {b.references.join(', ')}
                  </li>
                ))}
              </ul>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  style={buttonStyle(true)}
                  onClick={() => {
                    const ok = window.confirm(
                      `Remove ${blocked.length} entr${blocked.length === 1 ? 'y' : 'ies'} anyway?\n\nWherever they are used will be left with nothing in that spot, so it is worth putting something else there afterwards.`
                    )
                    if (ok) void post('purge-missing', blocked.map((b) => b.key), true)
                  }}
                >
                  {state === 'working' ? 'Removing…' : 'Remove them anyway'}
                </button>
              </div>
            </div>
          )}

          <Group
            title="Sizes recorded wrongly"
            empty="Every recorded size matches its file."
            count={result.mismatched.length}
            summary="so the storage total is slightly out"
            action={
              result.mismatched.length > 0
                ? {
                    label: state === 'working' ? 'Correcting…' : 'Correct these',
                    danger: false,
                    onClick: () => void post('correct-sizes'),
                  }
                : undefined
            }
            rows={result.mismatched.map((m) => ({
              key: m.key,
              label: m.originalName ?? m.key,
              detail: `recorded ${formatBytes(m.recordedBytes)}, actually ${formatBytes(m.storedBytes)}`,
            }))}
          />
        </div>
      )}
    </section>
  )
}

const MAX_ROWS_SHOWN = 20

function Group({
  title,
  empty,
  count,
  summary,
  rows,
  action,
}: {
  title: string
  empty: string
  count: number
  summary: string
  rows: { key: string; label: string; detail: string }[]
  action?: { label: string; danger: boolean; onClick: () => void }
}) {
  if (count === 0) {
    return (
      <div>
        <h3 style={headingStyle}>{title}</h3>
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{empty}</p>
      </div>
    )
  }
  const shown = rows.slice(0, MAX_ROWS_SHOWN)
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={headingStyle}>
          {title}: {count.toLocaleString('en-GB')}{' '}
          <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>{summary}</span>
        </h3>
        {action && (
          <button type="button" onClick={action.onClick} style={buttonStyle(action.danger)}>
            {action.label}
          </button>
        )}
      </div>
      <ul style={{ margin: 'var(--space-2) 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {shown.map((r) => (
          <li key={r.key} style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <span style={{ flexShrink: 0 }}>{r.detail}</span>
          </li>
        ))}
      </ul>
      {count > shown.length && (
        <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          …and {(count - shown.length).toLocaleString('en-GB')} more.
        </p>
      )}
    </div>
  )
}

const headingStyle = {
  margin: 0,
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--color-text)',
} as const

function buttonStyle(danger: boolean) {
  return {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    fontWeight: 500,
    color: danger ? 'var(--color-on-destructive)' : 'var(--color-text)',
    background: danger ? 'var(--color-destructive)' : 'var(--color-surface)',
    border: `1px solid ${danger ? 'var(--color-destructive)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    flexShrink: 0,
  } as const
}

function Message({ tone, children }: { tone: 'ok' | 'warn' | 'danger'; children: React.ReactNode }) {
  const colour = tone === 'ok' ? 'var(--color-success)' : tone === 'warn' ? 'var(--color-warning)' : 'var(--color-danger)'
  return (
    <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-sm)', color: colour }}>{children}</p>
  )
}
