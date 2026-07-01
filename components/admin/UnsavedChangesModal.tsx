'use client'

type Props = {
  /** The pending destination; null hides the modal. */
  pendingHref: string | null
  /** Disables the buttons while a save is in flight. */
  saving?: boolean
  /** Body copy - defaults to a generic unsaved-changes message. */
  message?: string
  onCancel: () => void
  onDiscard: () => void
  /** Omit to hide "Save & leave" (e.g. pages with no single save action). */
  onSave?: () => void
}

/**
 * Confirmation dialog shown when the user tries to leave a page with unsaved
 * changes. Pair with {@link useUnsavedChanges}.
 */
export function UnsavedChangesModal({ pendingHref, saving = false, message, onCancel, onDiscard, onSave }: Props) {
  if (pendingHref === null) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: 'var(--shadow-elevated)', maxWidth: 420, width: '100%', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--color-fg)' }}>Unsaved changes</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0 0 1.25rem' }}>
          {message ?? 'You have unsaved changes. Would you like to save them before leaving?'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn btn-secondary" onClick={onDiscard} disabled={saving}>Discard &amp; leave</button>
          {onSave && (
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save & leave'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
