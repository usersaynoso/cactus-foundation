'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

type Menu = {
  id: string
  name: string
  itemCount: number
  isMainMenu: boolean
  createdAt: string
}

export default function MenusPage() {
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''

  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteWarning, setDeleteWarning] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/menus')
      const d = await res.json()
      setMenus(d.menus ?? [])
    } catch {
      setError('Failed to load menus')
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async load on mount; setLoading(false) only fires after awaits
  useEffect(() => { load() }, [load])

  // A name that already exists (case-insensitive) - blocked client-side so the
  // admin gets an instant nudge rather than a round-trip and a server error.
  const trimmedNew = newName.trim()
  const nameTaken = menus.some((m) => m.name.toLowerCase() === trimmedNew.toLowerCase())

  async function handleCreate() {
    if (!trimmedNew || nameTaken) return
    setCreateError('')
    try {
      const res = await fetch('/api/admin/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedNew }),
      })
      if (!res.ok) {
        const d = await res.json()
        setCreateError(d.error ?? 'Failed to create menu')
        return
      }
      setNewName('')
      setCreating(false)
      await load()
    } catch {
      setCreateError('Failed to create menu')
    }
  }

  function cancelCreate() {
    setCreating(false)
    setNewName('')
    setCreateError('')
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return
    try {
      const res = await fetch(`/api/admin/menus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to rename')
        return
      }
      setRenaming(null)
      await load()
    } catch {
      setError('Failed to rename menu')
    }
  }

  async function handleSetMain(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/menus/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isMainMenu: true }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to set main menu')
        return
      }
      await load()
    } catch {
      setError('Failed to set main menu')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/menus/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Failed to duplicate menu')
        return
      }
      await load()
    } catch {
      setError('Failed to duplicate menu')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/menus/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Failed to delete')
        setDeleteId(null)
        return
      }
      if (d.wasMainMenu) {
        setError('Menu deleted. The site header is now empty — go to Settings → General to assign a new main menu.')
      }
      setDeleteId(null)
      await load()
    } catch {
      setError('Failed to delete menu')
      setDeleteId(null)
    }
  }

  if (loading) return <p>Loading…</p>

  const q = filter.trim().toLowerCase()
  const shown = q ? menus.filter((m) => m.name.toLowerCase().includes(q)) : menus

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Menus</h1>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New menu</button>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
          <button
            onClick={() => setError('')}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
          >×</button>
        </div>
      )}

      {creating && (
        <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Menu name (e.g. Main Navigation)"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') cancelCreate() }}
              style={{ width: '100%' }}
            />
            {nameTaken && <p style={{ color: 'var(--color-warning)', fontSize: 'var(--text-base)', marginTop: 'var(--space-1)' }}>A menu called “{trimmedNew}” already exists.</p>}
            {createError && <p style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-base)', marginTop: 'var(--space-1)' }}>{createError}</p>}
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!trimmedNew || nameTaken}>Create</button>
          <button className="btn btn-secondary" onClick={cancelCreate}>Cancel</button>
        </div>
      )}

      {menus.length === 0 && !creating && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          <p style={{ marginBottom: '1rem' }}>No menus yet. Create one to start building your site&apos;s navigation.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New menu</button>
        </div>
      )}

      {menus.length > 1 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter menus by name…"
            aria-label="Filter menus"
            style={{ width: '100%', maxWidth: 360 }}
          />
        </div>
      )}

      {menus.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Items</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((menu) => (
                <tr key={menu.id}>
                  <td>
                    {renaming === menu.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(menu.id); if (e.key === 'Escape') setRenaming(null) }}
                          style={{ flex: 1 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleRename(menu.id)}>Save</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{menu.name}</strong>
                        {menu.isMainMenu && (
                          <span className="badge badge-success">★ Main menu</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-muted)' }}>
                    {menu.itemCount === 0 ? (
                      <span className="badge badge-gray" title="This menu has no items yet">empty</span>
                    ) : (
                      menu.itemCount
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                    {new Date(menu.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Link href={`/${adminPath}/menus/${menu.id}`} className="btn btn-secondary btn-sm">
                        Edit items
                      </Link>
                      {!menu.isMainMenu && (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyId === menu.id}
                          title="Show this menu in the site header"
                          onClick={() => handleSetMain(menu.id)}
                        >
                          Set as main
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setRenaming(menu.id); setRenameValue(menu.name) }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === menu.id}
                        title="Create a copy of this menu and all its items"
                        onClick={() => handleDuplicate(menu.id)}
                      >
                        Duplicate
                      </button>
                      {deleteId === menu.id ? (
                        <>
                          {deleteWarning && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-destructive)', alignSelf: 'center' }}>{deleteWarning}</span>}
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(menu.id)}>Confirm</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setDeleteId(null); setDeleteWarning('') }}>Cancel</button>
                        </>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setDeleteId(menu.id)
                            setDeleteWarning(
                              menu.isMainMenu
                                ? '⚠ This is your main menu — deleting it will empty the site header.'
                                : ''
                            )
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {q && shown.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem' }}>No menus match &quot;{filter}&quot;.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)', marginTop: 'var(--space-6)' }}>
        The main menu is the one shown in your site header. Use <strong>Set as main</strong> above, or change it any time from{' '}
        <Link href={`/${adminPath}/config`} style={{ color: 'var(--color-primary)' }}>
          Settings → General
        </Link>.
      </p>
    </div>
  )
}
