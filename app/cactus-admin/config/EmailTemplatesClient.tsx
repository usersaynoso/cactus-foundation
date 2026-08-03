'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Every email the site sends, in one editor: core's member, sign-in and system
// emails, plus whatever the installed modules have declared. Each one gets its
// own copy, its own on/off switch (where switching it off is safe), and its own
// choice of wrapper design - or the site default, which is what they all start on.

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

export default function EmailTemplatesClient() {
  const [groups, setGroups] = useState<Group[]>([])
  const [wrappers, setWrappers] = useState<Wrapper[]>([])
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
  const [previewOpen, setPreviewOpen] = useState(false)

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
        setGroups(d.groups ?? [])
        setWrappers(d.wrappers ?? [])
      })
      .catch(() => { if (!cancelled) setError('Could not load the emails.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadToken])

  const allTemplates = useMemo(() => groups.flatMap((g) => g.templates), [groups])
  const active = allTemplates.find((t) => t.key === activeKey) ?? null

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
    setPreviewOpen(false)
    setPreviewHtml('')
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

  async function preview() {
    if (!activeKey) return
    setError('')
    try {
      const res = await fetch('/api/admin/emails/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: activeKey, subject, bodyHtml, wrapperLayoutId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not build the preview.')
      setPreviewHtml(d.html)
      setPreviewOpen(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not build the preview.')
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
      <p style={{ margin: '0 0 1.25rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-base)' }}>
        Every email your site sends. Change the wording, decide which design wraps around it, and send
        yourself a copy before anyone else gets one. {wrappers.length === 0 && (
          <>No wrapper designs yet - make one under Layouts, on the Email Wrapper tab.</>
        )}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
        <div>
          {loading && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>}
          {groups.map((group) => (
            <div key={`${group.source}:${group.groupLabel}`} style={{ marginBottom: 'var(--space-4)' }}>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {group.groupLabel}
              </div>
              {group.templates.map((t) => (
                <button
                  key={t.key}
                  onClick={() => selectTemplate(t.key)}
                  className={`btn ${activeKey === t.key ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 'var(--space-1)' }}
                >
                  <span>{t.label}</span>
                  {t.isOverridden && (
                    <span className="badge badge-blue" style={{ marginLeft: 'var(--space-2)' }}>Edited</span>
                  )}
                  {!t.isActive && (
                    <span className="badge badge-gray" style={{ marginLeft: 'var(--space-2)' }}>Off</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div>
          {!active && !loading && (
            <p style={{ color: 'var(--color-text-muted)' }}>Pick an email on the left to change it.</p>
          )}
          {active && (
            <div className="card">
              {error && <div className="alert alert-danger">{error}</div>}
              {message && <div className="alert alert-success">{message}</div>}

              <div className="field">
                <label>Wording you can drop in</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {active.mergeTags.map((tag) => (
                    <code
                      key={tag}
                      style={{
                        background: 'var(--color-bg-subtle)',
                        padding: '2px 6px',
                        borderRadius: 'var(--radius)',
                        fontSize: 'var(--text-sm)',
                        border: active.requiredTags.includes(tag) ? '1px solid var(--color-border)' : undefined,
                      }}
                      title={active.requiredTags.includes(tag) ? 'This one has to stay in - the email does not work without it.' : undefined}
                    >
                      {'{{' + tag + '}}'}
                      {active.requiredTags.includes(tag) ? ' *' : ''}
                    </code>
                  ))}
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
                  rows={10}
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
                <button className="btn btn-secondary" onClick={preview}>Preview</button>
                <button className="btn btn-secondary" disabled={testing} onClick={testSend}>
                  {testing ? 'Sending…' : 'Send test to myself'}
                </button>
                {active.isOverridden && (
                  <button className="btn btn-ghost" disabled={saving} onClick={resetToDefault}>
                    Put the original wording back
                  </button>
                )}
              </div>

              {previewOpen && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Preview</div>
                  {/* Sandboxed iframe: the preview is a whole email document with
                      its own styles, and it has no business inheriting - or
                      reaching into - the admin around it. */}
                  <iframe
                    title="Email preview"
                    srcDoc={previewHtml}
                    sandbox=""
                    style={{
                      width: '100%',
                      height: 520,
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius)',
                      background: '#ffffff',
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
