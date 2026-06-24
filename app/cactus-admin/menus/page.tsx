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

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreateError('')
    try {
      const res = await fetch('/api/admin/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
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

  return (
    <div style={{ maxWidth: 760 }}>
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
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ width: '100%' }}
            />
            {createError && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{createError}</p>}
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>Create</button>
          <button className="btn btn-secondary" onClick={() => { setCreating(false); setNewName(''); setCreateError('') }}>Cancel</button>
        </div>
      )}

      {menus.length === 0 && !creating && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
          <p style={{ marginBottom: '1rem' }}>No menus yet. Create one to start building your site&apos;s navigation.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New menu</button>
        </div>
      )}

      {menus.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {menus.map((menu) => (
                <tr key={menu.id}>
                  <td>
                    {renaming === menu.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleRename(menu.id)}
                          style={{ flex: 1 }}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => handleRename(menu.id)}>Save</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{menu.name}</strong>
                        {menu.isMainMenu && (
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.125rem 0.5rem', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600 }}>
                            Main menu
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ color: '#6b7280' }}>{menu.itemCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <Link href={`/${adminPath}/menus/${menu.id}`} className="btn btn-secondary btn-sm">
                        Edit items
                      </Link>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { setRenaming(menu.id); setRenameValue(menu.name) }}
                      >
                        Rename
                      </button>
                      {deleteId === menu.id ? (
                        <>
                          {deleteWarning && <span style={{ fontSize: '0.8125rem', color: '#dc2626', alignSelf: 'center' }}>{deleteWarning}</span>}
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
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '1.5rem' }}>
        To set the main menu shown in the site header, go to{' '}
        <Link href={`/${adminPath}/config`} style={{ color: 'var(--color-primary)' }}>
          Settings → General
        </Link>.
      </p>
    </div>
  )
}
