import type { ReactNode } from 'react'

// Puck's `headerActions` override wraps whatever sits in the header's action
// area (just its native Update/Publish button by default) — piggyback on it
// to put Delete and Preview to its left instead of buried in the Settings
// tab, so all three live-affecting actions sit together in one place.
export function createHeaderActionsOverride(opts: {
  previewHref: string
  onDeleteClick: () => void
  deleting: boolean
  canDelete?: boolean
}) {
  return function HeaderActionsOverride({ children }: { children: ReactNode }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {opts.canDelete !== false && (
          <button
            type="button"
            className="btn btn-danger"
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem' }}
            disabled={opts.deleting}
            onClick={opts.onDeleteClick}
          >
            Delete
          </button>
        )}
        <a
          href={opts.previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.75rem', textDecoration: 'none' }}
        >
          Preview
        </a>
        {children}
      </div>
    )
  }
}
