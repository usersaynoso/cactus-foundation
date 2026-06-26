'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { generateSlug } from '@/lib/utils'

export default function NewPagePage() {
  const router = useRouter()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [canManageMenus, setCanManageMenus] = useState(false)
  const [menuIds, setMenuIds] = useState<string[]>([])
  const [menus, setMenus] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/pages/perms').then((r) => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/api/admin/menus').then((r) => r.ok ? r.json() : { menus: [] }).catch(() => ({ menus: [] })),
    ]).then(([perms, menusData]) => {
      setCanManageMenus((perms as { canManageMenus?: boolean }).canManageMenus ?? false)
      setMenus((menusData as { menus?: { id: string; name: string }[] }).menus ?? [])
    }).catch(() => {})
  }, [])

  function handleTitleChange(val: string) {
    setTitle(val)
    if (!slugEdited) setSlug(generateSlug(val))
  }

  async function handleCreate() {
    if (!title || !slug) return
    setError('')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { title, slug, bodyFormat: 'builder', status: 'draft' }
      if (canManageMenus && menuIds.length > 0) payload.menuIds = menuIds
      const res = await fetch('/api/admin/pages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to create page')
      router.push(`/${adminPath}/pages/${d.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create page')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-header">
        <h1 className="page-title">New Page</h1>
        <button className="btn btn-primary" disabled={!title || !slug || loading} onClick={handleCreate}>
          {loading ? 'Creating…' : 'Create & Open Builder'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="field">
        <label>Title</label>
        <input value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Page title" autoFocus />
      </div>

      <div className="field">
        <label>Slug</label>
        <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugEdited(true) }} placeholder="page-slug" />
        <span className="field-hint">URL: <code>/{slug}</code></span>
      </div>

      {canManageMenus && menus.length > 0 && (
        <div className="field">
          <label>Show in menus</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {menus.map((menu) => (
              <label key={menu.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9375rem' }}>
                <input
                  type="checkbox"
                  checked={menuIds.includes(menu.id)}
                  onChange={(e) => {
                    if (e.target.checked) setMenuIds((prev) => [...prev, menu.id])
                    else setMenuIds((prev) => prev.filter((id) => id !== menu.id))
                  }}
                />
                {menu.name}
              </label>
            ))}
          </div>
          <span className="field-hint">The page will be added to the selected menus when saved.</span>
        </div>
      )}
    </div>
  )
}
