'use client'

import { type CSSProperties, useState } from 'react'
import { formatBytes } from './format'

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'skipped'
export type UploadTask = {
  id: string
  name: string
  size: number
  status: UploadStatus
  /** 0..1 transfer fraction, only meaningful while uploading. */
  progress: number
  error?: string
  /** Human name of the folder the file is landing in. */
  destination: string
}

// Fixed panel, bottom-left (toasts own bottom-right). Shows every file in the
// current upload batch with a live progress bar, so an upload is never a silent
// spinner - successes tick green, failures stay red with the reason, and the
// whole thing collapses to a one-line summary.
export default function MediaUploadQueue({ tasks, onClear, onDismiss }: {
  tasks: UploadTask[]
  /** Remove all finished (done/error/skipped) tasks. */
  onClear: () => void
  /** Remove one task from the list. */
  onDismiss: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  if (tasks.length === 0) return null

  const active = tasks.filter((t) => t.status === 'queued' || t.status === 'uploading').length
  const done = tasks.filter((t) => t.status === 'done').length
  const failed = tasks.filter((t) => t.status === 'error').length
  const allFinished = active === 0
  const overall = tasks.reduce((sum, t) => sum + (t.status === 'done' || t.status === 'skipped' ? 1 : t.status === 'uploading' ? t.progress : 0), 0) / tasks.length

  const title = active > 0
    ? `Uploading ${active} file${active === 1 ? '' : 's'}…`
    : failed > 0
      ? `${done} uploaded, ${failed} failed`
      : `Uploaded ${done} file${done === 1 ? '' : 's'}`

  return (
    <div style={panel} role="status" aria-live="polite">
      <div style={header}>
        <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand' : 'Collapse'} style={collapseBtn}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {allFinished && (
          <button type="button" onClick={onClear} aria-label="Clear finished uploads" style={clearBtn}>Clear</button>
        )}
      </div>

      {/* Overall bar while anything is still in flight. */}
      {active > 0 && (
        <div style={{ padding: '0 var(--space-3)' }}>
          <div style={track}><div style={{ ...fill, width: `${Math.round(overall * 100)}%`, background: 'var(--color-primary)' }} /></div>
        </div>
      )}

      {!collapsed && (
        <ul style={list}>
          {tasks.map((t) => (
            <li key={t.id} style={row}>
              <span aria-hidden style={{ flexShrink: 0, width: '1rem', textAlign: 'center', color: glyphColour(t.status) }}>{glyph(t.status)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>{t.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{formatBytes(t.size)}</span>
                </div>
                {t.status === 'uploading' || t.status === 'queued' ? (
                  <div style={{ ...track, marginTop: '0.3rem' }}>
                    <div style={{ ...fill, width: `${Math.round((t.status === 'uploading' ? t.progress : 0) * 100)}%`, background: 'var(--color-primary)' }} />
                  </div>
                ) : t.error ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', marginTop: '0.15rem', wordBreak: 'break-word' }}>{t.error}</div>
                ) : (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                    {t.status === 'skipped' ? 'Skipped' : `Uploaded to ${t.destination}`}
                  </div>
                )}
              </div>
              {(t.status === 'done' || t.status === 'error' || t.status === 'skipped') && (
                <button type="button" onClick={() => onDismiss(t.id)} aria-label={`Dismiss ${t.name}`} style={dismissBtn}>×</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function glyph(s: UploadStatus): string {
  return s === 'done' ? '✓' : s === 'error' ? '⚠' : s === 'skipped' ? '–' : '↑'
}
function glyphColour(s: UploadStatus): string {
  return s === 'done' ? 'var(--color-success)' : s === 'error' ? 'var(--color-error)' : 'var(--color-text-muted)'
}

const panel: CSSProperties = { position: 'fixed', left: 'var(--space-5)', bottom: 'var(--space-5)', zIndex: 200, width: 'min(340px, 90vw)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }
const header: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)' }
const collapseBtn: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.75rem', padding: 0, width: '1rem' }
const clearBtn: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontFamily: 'inherit', padding: '0.1rem 0.3rem' }
const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 260, overflowY: 'auto' }
const row: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }
const track: CSSProperties = { height: 4, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-subtle)', overflow: 'hidden' }
const fill: CSSProperties = { height: '100%', borderRadius: 'var(--radius-full)', transition: 'width var(--dur-fast)' }
const dismissBtn: CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1, padding: 0, flexShrink: 0 }
