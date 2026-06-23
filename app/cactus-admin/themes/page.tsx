'use client'

import { useState, useEffect, useCallback } from 'react'

type Theme = {
  id: string
  name: string
  repoUrl: string | null
  version: string
  isActive: boolean
  installedAt: string
}

export default function ThemesPage() {
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/themes')
      const d = await res.json()
      setThemes(d.themes ?? [])
    } catch {
      setError('Failed to load themes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleInstall() {
    setError('')
    setInstalling(true)
    try {
      const res = await fetch('/api/admin/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Install failed')
      setRepoUrl('')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  async function handleActivate(id: string) {
    setError('')
    try {
      const res = await fetch(`/api/admin/themes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Activation failed')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Activation failed')
    }
  }

  if (loading) return <p>Loading…</p>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Themes</h1>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
        Activating a theme is immediate — no redeploy needed. Installing a new theme (from a GitHub repo) commits it as a submodule and triggers a deployment.
      </div>

      <div className="table-wrapper" style={{ marginBottom: '2rem' }}>
        <table>
          <thead>
            <tr>
              <th>Theme</th>
              <th>Version</th>
              <th>Source</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {themes.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9ca3af' }}>No themes found</td></tr>
            )}
            {themes.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong></td>
                <td>v{t.version}</td>
                <td style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {t.repoUrl ? (
                    <a href={t.repoUrl} target="_blank" rel="noopener noreferrer">
                      {t.repoUrl.replace('https://github.com/', '')}
                    </a>
                  ) : (
                    'Bundled'
                  )}
                </td>
                <td>
                  {t.isActive ? (
                    <span className="badge badge-green">Active</span>
                  ) : (
                    <span className="badge badge-gray">Inactive</span>
                  )}
                </td>
                <td>
                  {!t.isActive && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleActivate(t.id)}
                    >
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="card-title">Install a theme</h2>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/cactus-theme-name"
            style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.9375rem' }}
          />
          <button
            className="btn btn-primary"
            disabled={!repoUrl || installing}
            onClick={handleInstall}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0.5rem 0 0' }}>
          Public GitHub repos only. The theme will be added as a git submodule.
        </p>
      </div>
    </div>
  )
}
