'use client'

import { useCallback, useState, type CSSProperties } from 'react'

// "Give me something to start from" - the button under a reply box, and what
// happens after somebody presses it.
//
// Core chrome rather than any one module's, because a reply box is not a rare
// thing: the Unified Inbox has one, the contact form's own inbox has one, and
// the next module with a conversation on it will have one too. What actually
// writes the drafts is a module publishing `core.reply-suggestions` (see
// lib/conversations/reply-suggestions.ts); this knows nothing about it beyond
// the endpoint it was handed.
//
// THE HOST OWNS THE WRITING BOX, and that is the whole shape of this thing.
// Clicking a draft asks the host to show it - it does not put it anywhere
// itself - and clicking the cross asks the host to put back whatever was there
// before. Otherwise every host would need this component to understand its own
// box: markdown here, contentEditable markup there, a plain textarea in the
// third. Two callbacks, and the box stays where it belongs.

type Props = {
  /** POSTed to with no body. Answers `{ suggestions: string[] }`, or
   *  `{ error }` with a status on anything that went wrong. */
  endpoint: string
  /** While the host is busy doing something else with the message. */
  disabled?: boolean
  /**
   * Show this draft in the box. `null` means "put back what was there" - the
   * host stashes the original on the FIRST preview and restores it here.
   */
  onPreview: (text: string | null) => void
  /** Keep it. The draft is the reply now, and whatever was in the box before it
   *  is not coming back. */
  onAccept: (text: string) => void
  /** What the button says. A note to a colleague is not a reply to a customer,
   *  and the odd host will want to say so. */
  label?: string
}

const SparkIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path
      d="M8 1.5l1.4 3.6L13 6.5l-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5zM12.8 10.2l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5z"
      fill="currentColor"
    />
  </svg>
)

const TickIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CrossIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const panelStyle: CSSProperties = {
  marginTop: '0.5rem',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg-subtle)',
  padding: '0.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
}

function cardStyle(chosen: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    width: '100%',
    textAlign: 'left',
    padding: '0.5rem 0.625rem',
    borderRadius: 6,
    border: chosen ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
    background: chosen ? 'var(--color-primary-subtle)' : 'var(--color-surface)',
    color: 'var(--color-text)',
    font: 'inherit',
    fontSize: 'var(--text-sm, 0.875rem)',
    lineHeight: 1.45,
    cursor: 'pointer',
    whiteSpace: 'pre-wrap',
  }
}

const iconButtonStyle = (tone: 'keep' | 'drop'): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.75rem',
  height: '1.75rem',
  flexShrink: 0,
  borderRadius: 6,
  cursor: 'pointer',
  border: `1px solid ${tone === 'keep' ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
  background: tone === 'keep' ? 'var(--color-primary)' : 'var(--color-surface)',
  color: tone === 'keep' ? 'var(--color-on-primary)' : 'var(--color-text-secondary)',
  padding: 0,
})

export function ReplySuggestions({ endpoint, disabled = false, onPreview, onAccept, label = 'Suggest reply' }: Props) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null)
  const [chosen, setChosen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /** Shut the panel and put the box back the way it was. Everything that ends
   *  the exchange without keeping a draft goes through here, so there is one
   *  place that can leave a preview stranded in somebody's box and it is
   *  written once. */
  const dismiss = useCallback(() => {
    setSuggestions(null)
    setChosen(null)
    setError('')
    onPreview(null)
  }, [onPreview])

  const ask = useCallback(async () => {
    setBusy(true)
    setError('')
    // Anything already being previewed goes back first: the new drafts are
    // about the conversation, not about the draft that happened to be in the
    // box when they were asked for.
    onPreview(null)
    setChosen(null)
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' } })
      const answer = await res.json().catch(() => null) as { suggestions?: unknown; error?: string } | null
      if (!res.ok) {
        setError(answer?.error ?? 'Could not get any suggestions just now.')
        setSuggestions(null)
        return
      }
      const drafts = Array.isArray(answer?.suggestions)
        ? answer.suggestions.filter((one): one is string => typeof one === 'string' && one.trim().length > 0)
        : []
      if (drafts.length === 0) {
        setError('Nothing useful came back. Try again, or write it yourself this time.')
        setSuggestions(null)
        return
      }
      setSuggestions(drafts)
    } catch {
      setError('Could not reach the site to ask for suggestions.')
      setSuggestions(null)
    } finally {
      setBusy(false)
    }
  }, [endpoint, onPreview])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => { void ask() }}
          disabled={disabled || busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
        >
          {SparkIcon}
          {busy ? 'Having a think...' : suggestions ? 'Suggest three more' : label}
        </button>
        {suggestions && !busy && (
          <button type="button" className="btn btn-link btn-sm" onClick={dismiss}>
            Not this time
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          {error}
        </div>
      )}

      {suggestions && (
        <div style={panelStyle}>
          <p style={{ margin: 0, fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--color-text-secondary)' }}>
            {chosen === null
              ? 'Written for you, so read it before it goes anywhere. Click one to try it in the box.'
              : 'That one is in the box now. Keep it with the tick, or take it back out with the cross.'}
          </p>
          {suggestions.map((draft, index) => {
            const isChosen = chosen === index
            return (
              <div key={index} style={{ display: 'flex', alignItems: 'stretch', gap: '0.375rem' }}>
                <button
                  type="button"
                  style={cardStyle(isChosen)}
                  aria-pressed={isChosen}
                  onClick={() => {
                    if (isChosen) return
                    setChosen(index)
                    onPreview(draft)
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      fontSize: 'var(--text-xs, 0.75rem)',
                      fontWeight: 600,
                      color: isChosen ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      lineHeight: 1.45,
                    }}
                  >
                    {index + 1}
                  </span>
                  <span>{draft}</span>
                </button>
                {isChosen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      style={iconButtonStyle('keep')}
                      title="Keep this one"
                      aria-label="Keep this suggestion"
                      onClick={() => {
                        onAccept(draft)
                        setSuggestions(null)
                        setChosen(null)
                        setError('')
                      }}
                    >
                      {TickIcon}
                    </button>
                    <button
                      type="button"
                      style={iconButtonStyle('drop')}
                      title="Take it back out"
                      aria-label="Take this suggestion back out of the box"
                      onClick={() => {
                        setChosen(null)
                        onPreview(null)
                      }}
                    >
                      {CrossIcon}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
