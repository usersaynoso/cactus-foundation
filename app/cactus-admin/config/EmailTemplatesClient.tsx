'use client'

import { useEffect, useState } from 'react'

type Template = {
  key: string
  label: string
  mergeTags: string[]
  transactional: boolean
  subject: string
  bodyHtml: string
  isOverridden: boolean
}

export default function EmailTemplatesClient() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function load() {
    fetch('/api/admin/members/email-templates').then((r) => r.json()).then((d) => {
      setTemplates(d.templates ?? [])
    })
  }

  useEffect(load, [])

  function selectTemplate(key: string) {
    const t = templates.find((x) => x.key === key)
    if (!t) return
    setActiveKey(key)
    setSubject(t.subject)
    setBodyHtml(t.bodyHtml)
    setMessage('')
    setError('')
  }

  const active = templates.find((t) => t.key === activeKey)

  async function save() {
    if (!activeKey) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/admin/members/email-templates/${activeKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to save')
      setMessage('Saved.')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function resetToDefault() {
    if (!activeKey) return
    await fetch(`/api/admin/members/email-templates/${activeKey}`, { method: 'DELETE' })
    load()
    setMessage('Reset to default.')
  }

  async function testSend() {
    if (!activeKey) return
    setError('')
    setMessage('')
    const res = await fetch('/api/admin/members/email-templates/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: activeKey }),
    })
    const d = await res.json()
    if (!res.ok) setError(d.error ?? 'Test send failed')
    else setMessage('Test email sent to your own address.')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-5)' }}>
      <div>
        {templates.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTemplate(t.key)}
            className={`btn ${activeKey === t.key ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 'var(--space-1)' }}
          >
            {t.label}
            {t.isOverridden && <span className="badge badge-blue" style={{ marginLeft: 'var(--space-2)' }}>Customised</span>}
            {t.transactional && <span className="field-hint" style={{ display: 'block', fontSize: '0.75rem' }}>Transactional</span>}
          </button>
        ))}
      </div>

      <div>
        {!active && <p style={{ color: 'var(--color-text-muted)' }}>Select a template to edit.</p>}
        {active && (
          <div className="card">
            {error && <div className="alert alert-danger">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            <div className="field">
              <label>Merge tags</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {active.mergeTags.map((tag) => (
                  <code key={tag} style={{ background: 'var(--color-bg-subtle)', padding: '2px 6px', borderRadius: 'var(--radius)', fontSize: 'var(--text-sm)' }}>
                    {'{{' + tag + '}}'}
                  </code>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="field">
              <label>Body (HTML)</label>
              <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={10} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--text-sm)' }} />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-secondary" onClick={testSend}>Send test to myself</button>
              {active.isOverridden && (
                <button className="btn btn-secondary" onClick={resetToDefault}>Reset to default</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
