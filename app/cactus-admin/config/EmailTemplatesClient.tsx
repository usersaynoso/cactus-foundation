'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Every email the site sends, in one editor: core's member, sign-in and system
// emails, plus whatever the installed modules have declared. Each one gets its
// own copy, its own on/off switch (where switching it off is safe), and its own
// choice of wrapper design - or the site default, which is what they all start on.
//
// Shown a section at a time. Listing all of them at once turned the page into a
// wall of buttons nobody could find anything in, so: pick a section, pick a
// template from the pills, and edit it with the real rendered email alongside.

type Template = {
  key: string
  label: string
  mergeTags: string[]
  requiredTags: string[]
  transactional: boolean
  subject: string
  bodyHtml: string
  defaultSubject: string
  defaultBodyHtml: string
  wrapperLayoutId: string | null
  isActive: boolean
  isOverridden: boolean
  updatedAt: string | null
}

type Group = { groupLabel: string; source: string; templates: Template[] }
type Wrapper = { id: string; name: string; status: string; isDefault: boolean }

/** A group is identified by both halves: two modules may both call a section
 * "Orders", and they are not the same section. */
const groupId = (g: Pick<Group, 'source' | 'groupLabel'>) => `${g.source}:${g.groupLabel}`

/** The preview is a real server render through the send path, so it is debounced
 * rather than fired on every keystroke. Long enough to sit out normal typing,
 * short enough that a pause feels like it updates straight away. */
const PREVIEW_DEBOUNCE_MS = 600

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="5.75" y="5.75" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.25 3.75A1.5 1.5 0 0 0 8.75 2.25h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5" />
    </svg>
  )
}

function TickIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  )
}

export default function EmailTemplatesClient() {
  const [groups, setGroups] = useState<Group[]>([])
  const [wrappers, setWrappers] = useState<Wrapper[]>([])
  const [activeGroupId, setActiveGroupId] = useState<string>('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [wrapperLayoutId, setWrapperLayoutId] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  // What the HTML currently in the pane was built from. Comparing it to the
  // editor's present contents is what "Updating…" means, so the flag needs no
  // state of its own - and no setState in an effect body to keep it honest.
  const [previewBuiltFrom, setPreviewBuiltFrom] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [copiedTag, setCopiedTag] = useState<string | null>(null)

  // Bumping this refetches. A plain load() called straight from an effect body
  // would setState synchronously during render, which is the cascading-render
  // trap react-hooks/set-state-in-effect exists to catch.
  const [reloadToken, setReloadToken] = useState(0)
  const load = useCallback(() => setReloadToken((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/emails/templates')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const loaded: Group[] = d.groups ?? []
        setGroups(loaded)
        setWrappers(d.wrappers ?? [])
        // A single section is not a choice worth making anyone make.
        const only = loaded.length === 1 ? loaded[0] : undefined
        if (only) setActiveGroupId((current) => current || groupId(only))
      })
      .catch(() => { if (!cancelled) setError('Could not load the emails.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadToken])

  const allTemplates = useMemo(() => groups.flatMap((g) => g.templates), [groups])
  const active = allTemplates.find((t) => t.key === activeKey) ?? null
  const activeGroup = groups.find((g) => groupId(g) === activeGroupId) ?? null

  function selectGroup(id: string) {
    setActiveGroupId(id)
    setActiveKey(null)
    setMessage('')
    setError('')
    setPreviewHtml('')
    setPreviewBuiltFrom('')
    setPreviewError('')
  }

  function selectTemplate(key: string) {
    const t = allTemplates.find((x) => x.key === key)
    if (!t) return
    setActiveKey(key)
    setSubject(t.subject)
    setBodyHtml(t.bodyHtml)
    setWrapperLayoutId(t.wrapperLayoutId)
    setIsActive(t.isActive)
    setMessage('')
    setError('')
    setPreviewHtml('')
    setPreviewBuiltFrom('')
    setPreviewError('')
  }

  // Live preview. Every edit to anything the render depends on schedules a fresh
  // one; the previous in-flight request is aborted so a slow early response can
  // never land on top of a newer one.
  const previewAbort = useRef<AbortController | null>(null)
  const previewInputs = useMemo(
    () => JSON.stringify({ key: activeKey, subject, bodyHtml, wrapperLayoutId }),
    [activeKey, subject, bodyHtml, wrapperLayoutId],
  )
  const previewPending = !!activeKey && previewBuiltFrom !== previewInputs

  useEffect(() => {
    if (!activeKey) return
    const timer = setTimeout(() => {
      previewAbort.current?.abort()
      const controller = new AbortController()
      previewAbort.current = controller
      fetch('/api/admin/emails/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: previewInputs,
        signal: controller.signal,
      })
        .then(async (res) => {
          const d = await res.json()
          if (!res.ok) throw new Error(d.error ?? 'Could not build the preview.')
          setPreviewHtml(d.html)
          setPreviewError('')
          setPreviewBuiltFrom(previewInputs)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setPreviewError(err instanceof Error ? err.message : 'Could not build the preview.')
          // Marked as built anyway: the pane is as up to date as it is going to
          // get, and leaving it saying "Updating…" for ever would be a lie.
          setPreviewBuiltFrom(previewInputs)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [activeKey, previewInputs])

  useEffect(() => () => previewAbort.current?.abort(), [])

  async function copyTag(tag: string) {
    const text = `{{${tag}}}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedTag(tag)
      setTimeout(() => setCopiedTag((current) => (current === tag ? null : current)), 1500)
    } catch {
      setError('Could not copy that - your browser would not let us at the clipboard.')
    }
  }

  async function patch(body: Record<string, unknown>, successMessage: string) {
    if (!activeKey) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/admin/emails/templates/${encodeURIComponent(activeKey)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save that.')
      setMessage(successMessage)
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setSaving(false)
    }
  }

  const save = () => patch({ subject, bodyHtml, wrapperLayoutId, isActive }, 'Saved.')

  async function resetToDefault() {
    if (!activeKey || !active) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/admin/emails/templates/${encodeURIComponent(activeKey)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Could not reset that.')
      setSubject(active.defaultSubject)
      setBodyHtml(active.defaultBodyHtml)
      setMessage('Wording put back to the original.')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset that.')
    } finally {
      setSaving(false)
    }
  }

  async function testSend() {
    if (!activeKey) return
    setError('')
    setMessage('')
    setTesting(true)
    try {
      const res = await fetch('/api/admin/emails/templates/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: activeKey, subject, bodyHtml, wrapperLayoutId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not send that.')
      setMessage(`Test sent to ${d.to}.`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setTesting(false)
    }
  }

  const defaultWrapperName = wrappers.find((w) => w.isDefault)?.name

  return (
    <div id="email-templates" className="admin-anchor">
      <p style={{ margin: '0 0 var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}>
        Every email your site sends. Change the wording, decide which design wraps around it, and send
        yourself a copy before anyone else gets one. {wrappers.length === 0 && (
          <>No wrapper designs yet - make one under Layouts, on the Email Wrapper tab.</>
        )}
      </p>

      {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>}

      {!loading && (
        <div className="field" style={{ maxWidth: '22rem' }}>
          <label htmlFor="emt-section">Section</label>
          <select id="emt-section" value={activeGroupId} onChange={(e) => selectGroup(e.target.value)}>
            <option value="">Choose a section…</option>
            {groups.map((g) => (
              <option key={groupId(g)} value={groupId(g)}>
                {g.groupLabel} ({g.templates.length})
              </option>
            ))}
          </select>
        </div>
      )}

      {activeGroup && (
        <div className="emt-pills" role="group" aria-label={`${activeGroup.groupLabel} emails`}>
          {activeGroup.templates.map((t) => (
            <button
              key={t.key}
              type="button"
              className="emt-pill"
              aria-pressed={activeKey === t.key}
              onClick={() => selectTemplate(t.key)}
            >
              <span>{t.label}</span>
              {t.isOverridden && <span className="badge badge-blue">Edited</span>}
              {!t.isActive && <span className="badge badge-gray">Off</span>}
            </button>
          ))}
        </div>
      )}

      {activeGroup && !active && (
        <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>Pick an email above to change it.</p>
      )}

      {active && (
        <div className="emt-split">
          <div className="card" style={{ marginBottom: 0 }}>
            {error && <div className="alert alert-danger">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            <div className="field">
              <label>Wording you can drop in</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {active.mergeTags.map((tag) => {
                  const required = active.requiredTags.includes(tag)
                  return (
                    <span
                      key={tag}
                      className={`emt-tag${required ? ' emt-tag-required' : ''}`}
                      title={required ? 'This one has to stay in - the email does not work without it.' : undefined}
                    >
                      <code>{'{{' + tag + '}}'}{required ? ' *' : ''}</code>
                      <button
                        type="button"
                        className="emt-copy"
                        onClick={() => copyTag(tag)}
                        aria-label={`Copy {{${tag}}}`}
                        title={copiedTag === tag ? 'Copied' : 'Copy to clipboard'}
                      >
                        {copiedTag === tag ? <TickIcon /> : <CopyIcon />}
                      </button>
                    </span>
                  )
                })}
              </div>
              {active.requiredTags.length > 0 && (
                <p className="field-hint">Anything marked * has to stay in, or the email is no use to whoever gets it.</p>
              )}
            </div>

            <div className="field">
              <label>Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="field">
              <label>Message</label>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={14}
                style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-sm)' }}
              />
              <p className="field-hint">Just the message. The header, footer and colours come from the wrapper design below.</p>
            </div>

            <div className="field">
              <label>Wrapper design</label>
              <select
                value={wrapperLayoutId ?? ''}
                onChange={(e) => setWrapperLayoutId(e.target.value || null)}
              >
                <option value="">
                  {defaultWrapperName ? `Site default (${defaultWrapperName})` : 'Site default'}
                </option>
                {wrappers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.status === 'published' ? '' : ' (draft)'}
                  </option>
                ))}
              </select>
              <p className="field-hint">Leave on the site default unless this particular email wants its own look.</p>
            </div>

            {!active.transactional && (
              <div className="field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <span>Send this email</span>
                </label>
                <p className="field-hint">Untick and this one stops going out. The rest carry on as normal.</p>
              </div>
            )}

            {active.transactional && (
              <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
                This one always goes out - it is how people get into, or back into, their account.
              </p>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-secondary" disabled={testing} onClick={testSend}>
                {testing ? 'Sending…' : 'Send test to myself'}
              </button>
              {active.isOverridden && (
                <button className="btn btn-ghost" disabled={saving} onClick={resetToDefault}>
                  Put the original wording back
                </button>
              )}
            </div>
          </div>

          <div className="emt-preview-pane">
            <div className="card" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <div style={{ fontWeight: 600 }}>Preview</div>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                  {previewPending ? 'Updating…' : 'Updates as you type'}
                </span>
              </div>
              {previewError && <div className="alert alert-danger">{previewError}</div>}
              {/* Sandboxed iframe: the preview is a whole email document with
                  its own styles, and it has no business inheriting - or
                  reaching into - the admin around it. */}
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                sandbox=""
                style={{
                  width: '100%',
                  height: 620,
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  background: '#ffffff',
                  opacity: previewPending && previewHtml ? 0.6 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
