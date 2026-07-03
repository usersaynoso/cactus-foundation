'use client'

import { useMemo, useState } from 'react'

type Role = { id: string; name: string; isProtected: boolean; permissionKeys: string[]; userCount: number }
type Permission = { key: string; description: string | null; module: string | null }

type Props = {
  roles: Role[]
  permissions: Permission[]
  activeModuleNames: string[]
}

// Friendly names for the built-in permission groups, in the order they
// should appear. Anything not listed here (module-contributed permissions)
// is grouped by module name and shown afterwards.
const CATEGORY_LABELS: Record<string, string> = {
  pages: 'Pages',
  media: 'Media',
  menus: 'Navigation menus',
  appearance: 'Appearance & design',
  layouts: 'Layouts',
  members: 'Members',
  users: 'Users',
  modules: 'Modules',
  roles: 'Roles & permissions',
  config: 'Site settings',
}
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS)

type Category = { key: string; label: string; perms: Permission[]; moduleActive: boolean }

function buildCategories(permissions: Permission[], activeModuleNames: string[]): Category[] {
  const byKey: Record<string, Permission[]> = {}
  for (const p of permissions) {
    const catKey = p.module ? `module:${p.module}` : (p.key.split('.')[0] ?? p.key)
    if (!byKey[catKey]) byKey[catKey] = []
    byKey[catKey].push(p)
  }

  const categories: Category[] = Object.entries(byKey).map(([catKey, perms]) => {
    if (catKey.startsWith('module:')) {
      const moduleName = catKey.slice('module:'.length)
      return { key: catKey, label: moduleName, perms, moduleActive: activeModuleNames.includes(moduleName) }
    }
    return { key: catKey, label: CATEGORY_LABELS[catKey] ?? catKey, perms, moduleActive: true }
  })

  categories.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.key)
    const bi = CATEGORY_ORDER.indexOf(b.key)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.label.localeCompare(b.label)
  })

  return categories
}

export default function RolesClient({ roles: initialRoles, permissions, activeModuleNames }: Props) {
  const [roles, setRoles] = useState(initialRoles)
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [showNewRole, setShowNewRole] = useState(false)
  const [search, setSearch] = useState('')

  const selectedRole = roles.find((r) => r.id === selectedRoleId)
  const categories = useMemo(() => buildCategories(permissions, activeModuleNames), [permissions, activeModuleNames])

  const query = search.trim().toLowerCase()
  const visibleCategories = query
    ? categories
        .map((c) => ({
          ...c,
          perms: c.perms.filter(
            (p) => p.key.toLowerCase().includes(query) || (p.description ?? '').toLowerCase().includes(query) || c.label.toLowerCase().includes(query)
          ),
        }))
        .filter((c) => c.perms.length > 0)
    : categories

  async function togglePermission(permKey: string, currently: boolean) {
    if (!selectedRole || selectedRole.isProtected) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}/permissions`, {
        method: currently ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionKey: permKey }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      setRoles((prev) => prev.map((r) => {
        if (r.id !== selectedRole.id) return r
        return {
          ...r,
          permissionKeys: currently
            ? r.permissionKeys.filter((k) => k !== permKey)
            : [...r.permissionKeys, permKey],
        }
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving that change')
    } finally {
      setLoading(false)
    }
  }

  async function setCategoryGranted(catPerms: Permission[], grant: boolean) {
    if (!selectedRole || selectedRole.isProtected) return
    const keys = catPerms
      .filter((p) => (grant ? !selectedRole.permissionKeys.includes(p.key) : selectedRole.permissionKeys.includes(p.key)))
      .map((p) => p.key)
    if (keys.length === 0) return
    setLoading(true)
    setError('')
    try {
      await Promise.all(
        keys.map((key) =>
          fetch(`/api/admin/roles/${selectedRole.id}/permissions`, {
            method: grant ? 'POST' : 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissionKey: key }),
          }).then(async (res) => {
            if (!res.ok) {
              const d = await res.json()
              throw new Error(d.error ?? 'Failed')
            }
          })
        )
      )
      setRoles((prev) => prev.map((r) => {
        if (r.id !== selectedRole.id) return r
        const permissionKeys = grant
          ? Array.from(new Set([...r.permissionKeys, ...keys]))
          : r.permissionKeys.filter((k) => !keys.includes(k))
        return { ...r, permissionKeys }
      }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving those changes')
    } finally {
      setLoading(false)
    }
  }

  async function createRole() {
    if (!newRoleName.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setRoles((prev) => [...prev, { id: d.id, name: d.name, isProtected: false, permissionKeys: [], userCount: 0 }])
      setSelectedRoleId(d.id)
      setNewRoleName('')
      setShowNewRole(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create that role')
    } finally {
      setLoading(false)
    }
  }

  async function deleteRole() {
    if (!selectedRole || selectedRole.isProtected || selectedRole.userCount > 0) return
    if (!confirm(`Delete the "${selectedRole.name}" role? This can't be undone.`)) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      setRoles((prev) => prev.filter((r) => r.id !== selectedRole.id))
      setSelectedRoleId(roles.find((r) => r.id !== selectedRole.id)?.id ?? '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete that role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'var(--space-6)', alignItems: 'start' }}>
      {/* Role list */}
      <div className="card" style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
            Roles
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{roles.length}</span>
        </div>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          {roles.map((r) => {
            const active = r.id === selectedRoleId
            const meta = r.isProtected
              ? `${r.userCount} ${r.userCount === 1 ? 'person' : 'people'} · all permissions`
              : `${r.userCount} ${r.userCount === 1 ? 'person' : 'people'} · ${r.permissionKeys.length} permission${r.permissionKeys.length === 1 ? '' : 's'}`
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRoleId(r.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: 'var(--space-2) var(--space-3)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                  background: active ? 'var(--color-primary-subtle)' : 'transparent',
                  marginBottom: '2px',
                }}
              >
                <div style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--color-primary-dark)' : 'var(--color-text)',
                  fontSize: 'var(--text-base)',
                }}>
                  {r.name}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: active ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', opacity: active ? 0.8 : 1 }}>
                  {meta}
                </div>
              </button>
            )
          })}
        </div>

        {showNewRole ? (
          <div style={{ padding: '0 var(--space-1)' }}>
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Editor"
              style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}
              onKeyDown={(e) => e.key === 'Enter' && createRole()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button className="btn btn-primary btn-sm" onClick={createRole} disabled={loading || !newRoleName.trim()}>Create</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewRole(false); setNewRoleName('') }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => setShowNewRole(true)}>
            + New role
          </button>
        )}
      </div>

      {/* Permission list */}
      <div>
        {error && <div className="alert alert-danger">{error}</div>}

        {selectedRole && (
          <>
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="card-title" style={{ margin: 0 }}>{selectedRole.name}</h2>
                  <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    {selectedRole.userCount === 0
                      ? 'Nobody has this role yet.'
                      : `${selectedRole.userCount} ${selectedRole.userCount === 1 ? 'person has' : 'people have'} this role.`}
                  </p>
                </div>
                {!selectedRole.isProtected && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={deleteRole}
                    disabled={loading || selectedRole.userCount > 0}
                    title={selectedRole.userCount > 0 ? 'Move everyone off this role before deleting it' : undefined}
                  >
                    Delete role
                  </button>
                )}
              </div>

              {selectedRole.isProtected && (
                <div className="alert alert-info" style={{ margin: 'var(--space-4) 0 0' }}>
                  This is the site&apos;s top-level role, so it always has full access. That keeps at least one
                  person in complete control of the site, so nothing here can be ticked or unticked.
                </div>
              )}
            </div>

            {!selectedRole.isProtected && (
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search permissions… e.g. members, media, pages"
                style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 420, fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)', marginBottom: 'var(--space-4)', display: 'block' }}
              />
            )}

            {!selectedRole.isProtected && visibleCategories.length === 0 && (
              <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No permissions match &quot;{search}&quot;.
              </div>
            )}

            {!selectedRole.isProtected && visibleCategories.map((cat) => {
              const grantedInCat = cat.perms.filter((p) => selectedRole.permissionKeys.includes(p.key))
              const allGranted = grantedInCat.length === cat.perms.length
              return (
                <div key={cat.key} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {cat.label}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {grantedInCat.length} of {cat.perms.length}
                      </span>
                      {!cat.moduleActive && <span className="badge badge-gray">module inactive</span>}
                    </div>
                    <button
                      className="btn btn-link btn-sm"
                      onClick={() => setCategoryGranted(cat.perms, !allGranted)}
                      disabled={loading || !cat.moduleActive}
                    >
                      {allGranted ? 'Clear all' : 'Select all'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                    {cat.perms.map((perm) => {
                      const granted = selectedRole.permissionKeys.includes(perm.key)
                      return (
                        <label
                          key={perm.key}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                            padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)',
                            cursor: cat.moduleActive ? 'pointer' : 'default',
                            opacity: cat.moduleActive ? 1 : 0.5,
                            background: granted ? 'var(--color-bg-subtle)' : 'transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={granted}
                            disabled={loading || !cat.moduleActive}
                            onChange={() => togglePermission(perm.key, granted)}
                            style={{ marginTop: '3px', flexShrink: 0 }}
                          />
                          <div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                              {perm.description || perm.key}
                            </div>
                            {perm.description && (
                              <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                                {perm.key}
                              </code>
                            )}
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
