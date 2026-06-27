'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Role = { id: string; name: string; isProtected: boolean; permissionKeys: string[] }
type Permission = { key: string; description: string | null; module: string | null }

type Props = {
  roles: Role[]
  permissions: Permission[]
  activeModuleNames: string[]
}

export default function RolesClient({ roles: initialRoles, permissions, activeModuleNames }: Props) {
  const router = useRouter()
  const [roles, setRoles] = useState(initialRoles)
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [showNewRole, setShowNewRole] = useState(false)

  const selectedRole = roles.find((r) => r.id === selectedRoleId)

  // Group permissions by module (null = core)
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const key = p.module ?? '__core__'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  async function togglePermission(permKey: string, currently: boolean) {
    if (!selectedRole || selectedRole.isProtected) return
    setLoading(true)
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
      setError(err instanceof Error ? err.message : 'Failed')
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
      setRoles((prev) => [...prev, { id: d.id, name: d.name, isProtected: false, permissionKeys: [] }])
      setSelectedRoleId(d.id)
      setNewRoleName('')
      setShowNewRole(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  async function deleteRole() {
    if (!selectedRole || selectedRole.isProtected) return
    if (!confirm(`Delete role "${selectedRole.name}"?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/roles/${selectedRole.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed')
      }
      setRoles((prev) => prev.filter((r) => r.id !== selectedRole.id))
      setSelectedRoleId(roles.find((r) => r.id !== selectedRole.id)?.id ?? '')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* Role list */}
      <div className="card" style={{ padding: '0.75rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRoleId(r.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.5rem 0.75rem', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: r.id === selectedRoleId ? '#f0fdf4' : 'transparent',
                fontWeight: r.id === selectedRoleId ? 600 : 400,
                color: r.id === selectedRoleId ? '#15803d' : '#111827',
                fontSize: '0.9375rem',
              }}
            >
              {r.name} {r.isProtected && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>•</span>}
            </button>
          ))}
        </div>

        {showNewRole ? (
          <div>
            <input
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name"
              style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: '0.375rem', fontSize: '0.875rem', fontFamily: 'inherit' }}
              onKeyDown={(e) => e.key === 'Enter' && createRole()}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button className="btn btn-primary btn-sm" onClick={createRole} disabled={loading}>Save</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowNewRole(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => setShowNewRole(true)}>
            + New role
          </button>
        )}
      </div>

      {/* Permission matrix */}
      <div>
        {error && <div className="alert alert-danger">{error}</div>}

        {selectedRole && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0 }}>{selectedRole.name}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {selectedRole.isProtected && (
                  <span className="badge badge-blue">Protected — all permissions granted</span>
                )}
                {!selectedRole.isProtected && (
                  <button className="btn btn-danger btn-sm" onClick={deleteRole} disabled={loading}>
                    Delete role
                  </button>
                )}
              </div>
            </div>

            {Object.entries(grouped).map(([groupKey, perms]) => {
              const isCore = groupKey === '__core__'
              const moduleActive = isCore || activeModuleNames.includes(groupKey)
              return (
                <div key={groupKey} style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: moduleActive ? 'var(--color-fg)' : 'var(--color-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isCore ? 'Core' : groupKey}
                    {!moduleActive && <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>module inactive</span>}
                  </div>
                  {perms.map((perm) => {
                    const granted = selectedRole.isProtected || selectedRole.permissionKeys.includes(perm.key)
                    return (
                      <label key={perm.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', marginBottom: '0.375rem', cursor: selectedRole.isProtected ? 'default' : 'pointer', opacity: moduleActive ? 1 : 0.5 }}>
                        <input
                          type="checkbox"
                          checked={granted}
                          disabled={selectedRole.isProtected || loading || !moduleActive}
                          onChange={() => togglePermission(perm.key, granted)}
                          style={{ marginTop: '0.125rem' }}
                        />
                        <div>
                          <code style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>{perm.key}</code>
                          {perm.description && (
                            <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{perm.description}</div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
