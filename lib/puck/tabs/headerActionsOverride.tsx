import { Children, cloneElement, isValidElement, type MouseEvent, type ReactNode } from 'react'
import { useEditorDirtyState } from './editorDirtyState'

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
    const { canUpdate } = useEditorDirtyState()

    // `children` is Puck's own Update button. Puck gives no prop hook for its state,
    // but the Button it renders does take `disabled` — clone that in so it greys out
    // with Puck's own disabled styling rather than us rebuilding the button by hand.
    const updateButton = Children.map(children, (child) => (
      isValidElement<{ disabled?: boolean }>(child)
        ? cloneElement(child, { disabled: !canUpdate })
        : child
    ))

    // That Button renders as a <span> (Puck passes it neither `type` nor `href`), so the
    // disabled attribute is cosmetic there — it greys the button but a click would still
    // reach Puck's own onClick and publish. Swallow the click in the capture phase, which
    // in React halts the whole dispatch before the span's own handler runs.
    const swallowClickWhenDisabled = (e: MouseEvent) => {
      if (!canUpdate) { e.preventDefault(); e.stopPropagation() }
    }

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
        <span
          onClickCapture={swallowClickWhenDisabled}
          aria-disabled={!canUpdate}
          title={canUpdate ? undefined : 'No changes to update'}
          style={{ display: 'inline-flex' }}
        >
          {updateButton}
        </span>
      </div>
    )
  }
}
