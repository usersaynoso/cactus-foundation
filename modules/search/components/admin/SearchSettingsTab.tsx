'use client'

import { useEffect, useRef, useState } from 'react'
import { TabStrip } from '@/components/admin/TabStrip'
import { useTabParam } from '@/modules/search/lib/admin-tab-url'
import SearchDashboard from '@/modules/search/components/admin/SearchDashboard'
import { ALLOWED_LANGUAGES, type SearchSettings, type SearchSourceKey } from '@/modules/search/lib/types'

type StatusSource = { key: SearchSourceKey; label: string; available: boolean; enabled: boolean; documentCount: number }

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '.8125rem', fontWeight: 500, marginBottom: '.25rem' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '.375rem .5rem', border: '1px solid var(--color-border)',
  borderRadius: 6, fontSize: '.8125rem', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)',
}
const rowStyle: React.CSSProperties = { marginBottom: '1rem', maxWidth: 480 }

function SettingsForm() {
  const [settings, setSettings] = useState<SearchSettings | null>(null)
  const [sources, setSources] = useState<StatusSource[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildDone, setRebuildDone] = useState<number | null>(null)
  const [rebuildProgress, setRebuildProgress] = useState(0)
  const rebuildCancelRef = useRef(false)

  // Same cursor loop as the Search dashboard: one bounded batch per request,
  // repeated until done, so any size of site rebuilds without a timeout.
  const rebuildIndex = async () => {
    setRebuilding(true)
    setRebuildDone(null)
    setRebuildProgress(0)
    rebuildCancelRef.current = false
    type RebuildCursor = { source: SearchSourceKey; offset: number } | null
    let cursor: RebuildCursor = null
    let processed = 0
    try {
      for (let guard = 0; guard < 500; guard++) {
        if (rebuildCancelRef.current) break
        const res = await fetch('/api/m/search/admin/reindex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full: true, cursor }),
        })
        if (!res.ok) {
          setError('Rebuild failed - try again.')
          break
        }
        const result = (await res.json()) as { done: boolean; cursor: RebuildCursor; processed: number }
        processed += result.processed
        setRebuildProgress(processed)
        if (result.done) {
          setRebuildDone(processed)
          break
        }
        cursor = result.cursor
      }
    } catch {
      setError('Rebuild failed - try again.')
    } finally {
      setRebuilding(false)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/m/search/admin/settings'),
      fetch('/api/m/search/admin/status'),
    ]).then(async ([settingsRes, statusRes]) => {
      if (settingsRes.status === 403 || settingsRes.status === 401) {
        setForbidden(true)
        setLoading(false)
        return
      }
      setSettings(await settingsRes.json())
      if (statusRes.ok) {
        const status = (await statusRes.json()) as { sources?: StatusSource[] }
        setSources((status.sources ?? []).filter((s) => s.available))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return null
  if (forbidden || !settings) {
    return <div className="alert alert-danger">Only administrators with the search permission can view or change search settings.</div>
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/m/search/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: settings.language,
          sources: settings.sources,
          weights: settings.weights,
          queryLogging: settings.queryLogging,
          logRetentionDays: settings.logRetentionDays,
          excerptLength: settings.excerptLength,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSettings(await res.json())
      setSaved(true)
    } catch {
      setError('Could not save settings - try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={rowStyle}>
        <label style={labelStyle}>Content types included in search</label>
        <p style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)', margin: '0 0 .5rem' }}>
          Site-wide master switches. A block on a page can narrow these further, but never re-enable one switched off here.
        </p>
        {sources.map((s) => (
          <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8125rem', padding: '.25rem 0' }}>
            <input
              type="checkbox"
              checked={settings.sources[s.key] !== false}
              onChange={(e) => setSettings({ ...settings, sources: { ...settings.sources, [s.key]: e.target.checked } })}
            />
            {s.label}
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '.75rem' }}>({s.documentCount} indexed)</span>
          </label>
        ))}
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Language</label>
        <select
          style={inputStyle}
          value={settings.language}
          onChange={(e) => setSettings({ ...settings, language: e.target.value })}
        >
          {ALLOWED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang === 'simple' ? 'simple (no stemming)' : lang}</option>
          ))}
        </select>
        <p style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)', margin: '.25rem 0 0' }}>
          How words are stemmed for matching. Changing this needs a full rebuild from the Search dashboard before it takes effect.
        </p>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Ranking weight per content type</label>
        <p style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)', margin: '0 0 .5rem' }}>
          1 is normal. Higher lifts a content type up the results; lower pushes it down.
        </p>
        {sources.map((s) => (
          <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8125rem', padding: '.125rem 0' }}>
            <span style={{ width: 140 }}>{s.label}</span>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              style={{ ...inputStyle, width: 90 }}
              value={settings.weights[s.key] ?? 1}
              onChange={(e) => {
                const value = parseFloat(e.target.value)
                setSettings({ ...settings, weights: { ...settings.weights, [s.key]: Number.isFinite(value) ? value : 1 } })
              }}
            />
          </label>
        ))}
      </div>

      <div style={rowStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.8125rem' }}>
          <input
            type="checkbox"
            checked={settings.queryLogging}
            onChange={(e) => setSettings({ ...settings, queryLogging: e.target.checked })}
          />
          Keep a log of search terms (no visitor details, just the words and result counts)
        </label>
      </div>

      {settings.queryLogging && (
        <div style={rowStyle}>
          <label style={labelStyle}>Keep search-term log for (days)</label>
          <input
            type="number"
            min={1}
            max={3650}
            style={{ ...inputStyle, width: 120 }}
            value={settings.logRetentionDays}
            onChange={(e) => setSettings({ ...settings, logRetentionDays: parseInt(e.target.value, 10) || 90 })}
          />
        </div>
      )}

      <div style={rowStyle}>
        <label style={labelStyle}>Excerpt length (characters)</label>
        <input
          type="number"
          min={60}
          max={600}
          style={{ ...inputStyle, width: 120 }}
          value={settings.excerptLength}
          onChange={(e) => setSettings({ ...settings, excerptLength: parseInt(e.target.value, 10) || 160 })}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span style={{ fontSize: '.8125rem', color: 'var(--color-success)' }}>Saved.</span>}
        {error && <span style={{ fontSize: '.8125rem', color: 'var(--color-danger)' }}>{error}</span>}
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)', maxWidth: 480 }}>
        <label style={labelStyle}>Search index</label>
        <p style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)', margin: '0 0 .5rem' }}>
          Refreshes itself overnight. Rebuild after changing the language or the switches above, or any time results look stale.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <button className="btn" onClick={rebuildIndex} disabled={rebuilding}>
            {rebuilding ? `Rebuilding… ${rebuildProgress} done` : 'Rebuild index now'}
          </button>
          {rebuilding && (
            <button className="btn" onClick={() => { rebuildCancelRef.current = true }}>Stop</button>
          )}
          {rebuildDone !== null && !rebuilding && (
            <span style={{ fontSize: '.8125rem', color: 'var(--color-success)' }}>Done - {rebuildDone} items indexed.</span>
          )}
        </div>
      </div>
    </div>
  )
}

// Search used to own a sidebar link for the index dashboard as well as this
// settings tab. Both are the same job - looking after the search index - so the
// dashboard moved in here as a sub-tab and the sidebar link went away.
export function SearchSettingsTab() {
  const [tab, setTab] = useTabParam('sub', 'settings', ['settings', 'index'] as const)

  return (
    <div>
      <TabStrip
        style={{ marginBottom: '1.5rem' }}
        items={[
          { key: 'settings', label: 'Settings', active: tab === 'settings', onClick: () => setTab('settings') },
          { key: 'index', label: 'Index & searches', active: tab === 'index', onClick: () => setTab('index') },
        ]}
      />
      {tab === 'settings' ? <SettingsForm /> : <SearchDashboard />}
    </div>
  )
}
