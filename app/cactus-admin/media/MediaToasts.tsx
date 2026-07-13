'use client'

import type { CSSProperties } from 'react'

export type ToastKind = 'error' | 'success' | 'info' | 'busy'
export type Toast = { id: number; kind: ToastKind; msg: string }

const TONE: Record<ToastKind, { bg: string; border: string; fg: string; glyph: string }> = {
  error: { bg: 'var(--color-error-bg)', border: 'var(--color-destructive-border)', fg: 'var(--color-error)', glyph: '⚠' },
  success: { bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', fg: 'var(--color-success)', glyph: '✓' },
  info: { bg: 'var(--color-info-bg)', border: 'var(--color-info-border)', fg: 'var(--color-info)', glyph: 'ℹ' },
  busy: { bg: 'var(--color-surface)', border: 'var(--color-border)', fg: 'var(--color-text)', glyph: '⋯' },
}

// Bottom-right stack. Transient toasts (error/success/info) are auto-dismissed by
// the parent; a "busy" toast persists while an operation runs. Rendered fixed so
// nothing in the grid shifts when a message appears or clears.
export default function MediaToasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div
      aria-live="polite"
      style={{ position: 'fixed', right: 'var(--space-5)', bottom: 'var(--space-5)', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: 'min(360px, 90vw)' }}
    >
      {toasts.map((t) => {
        const tone = TONE[t.kind]
        const style: CSSProperties = {
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: 'var(--radius-md)',
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          color: tone.fg,
          boxShadow: 'var(--shadow-lg)',
          fontSize: 'var(--text-sm)',
        }
        return (
          <div key={t.id} role="status" style={style}>
            <span aria-hidden style={{ flexShrink: 0, lineHeight: 1.4 }}>{tone.glyph}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
            {t.kind !== 'busy' && (
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, fontSize: '1rem', flexShrink: 0 }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
