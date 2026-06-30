'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

type MenuItemFull = {
  id: string
  menuId: string
  parentId: string | null
  type: 'PAGE' | 'EXTERNAL'
  pageId: string | null
  page: { id: string; title: string; slug: string; status: string } | null
  label: string | null
  url: string | null
  openInNewTab: boolean
  order: number
}

type Menu = {
  id: string
  name: string
  items: MenuItemFull[]
}

type PageResult = { id: string; title: string; slug: string; status: string }

function effectiveLabel(item: MenuItemFull): string {
  if (item.type === 'PAGE') return item.label ?? item.page?.title ?? '(untitled)'
  return item.label ?? '(no label)'
}

function getDescendantIds(itemId: string, items: MenuItemFull[]): Set<string> {
  const ids = new Set<string>()
  const queue = [itemId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const child of items.filter((i) => i.parentId === id)) {
      if (!ids.has(child.id)) {
        ids.add(child.id)
        queue.push(child.id)
      }
    }
  }
  return ids
}

function getItemDepth(itemId: string, items: MenuItemFull[]): number {
  let depth = 0
  let current = items.find((i) => i.id === itemId)
  while (current?.parentId) {
    depth++
    current = items.find((i) => i.id === current!.parentId)
    if (depth > 50) break // guard against cycles
  }
  return depth
}

export default function MenuDetailPage() {
  const { id: menuId } = useParams<{ id: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const adminPath = pathname.split('/')[1] ?? ''

  const [menu, setMenu] = useState<Menu | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Add item modal state
  const [addMode, setAddMode] = useState<'page' | 'external' | null>(null)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  // Page picker
  const [pageSearch, setPageSearch] = useState('')
  const [pageResults, setPageResults] = useState<PageResult[]>([])
  const [pageSearchLoading, setPageSearchLoading] = useState(false)
  // External form
  const [extLabel, setExtLabel] = useState('')
  const [extUrl, setExtUrl] = useState('')
  const [extNewTab, setExtNewTab] = useState(false)
  const [addError, setAddError] = useState('')

  // Edit item state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editNewTab, setEditNewTab] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Drag state
  const dragId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/menus/${menuId}`)
      if (!res.ok) { setError('Menu not found'); setLoading(false); return }
      const d = await res.json()
      setMenu(d)
    } catch {
      setError('Failed to load menu')
    } finally {
      setLoading(false)
    }
  }, [menuId])

  useEffect(() => { load() }, [load])

  // Page search for the page picker
  useEffect(() => {
    if (addMode !== 'page') return
    setPageSearchLoading(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/pages?perPage=30`)
        const d = await res.json()
        const allPages: PageResult[] = d.pages ?? []
        const inMenu = new Set(menu?.items.filter((i) => i.type === 'PAGE').map((i) => i.pageId) ?? [])
        const filtered = allPages.filter(
          (p) =>
            !inMenu.has(p.id) &&
            (!pageSearch || p.title.toLowerCase().includes(pageSearch.toLowerCase()) || p.slug.toLowerCase().includes(pageSearch.toLowerCase()))
        )
        setPageResults(filtered)
      } catch {
        setPageResults([])
      } finally {
        setPageSearchLoading(false)
      }
    }, 200)
    return () => clearTimeout(timeout)
  }, [pageSearch, addMode, menu])

  async function addPageItem(page: PageResult) {
    setAddError('')
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PAGE', pageId: page.id, parentId: addParentId }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? 'Failed to add item'); return }
      closeAddModal()
      await load()
    } catch {
      setAddError('Failed to add item')
    }
  }

  async function addExternalItem() {
    if (!extLabel.trim() || !extUrl.trim()) { setAddError('Label and URL are required'); return }
    setAddError('')
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'EXTERNAL', label: extLabel.trim(), url: extUrl.trim(), openInNewTab: extNewTab, parentId: addParentId }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? 'Failed to add item'); return }
      closeAddModal()
      await load()
    } catch {
      setAddError('Failed to add item')
    }
  }

  function closeAddModal() {
    setAddMode(null)
    setAddParentId(null)
    setPageSearch('')
    setPageResults([])
    setExtLabel('')
    setExtUrl('')
    setExtNewTab(false)
    setAddError('')
  }

  function startEdit(item: MenuItemFull) {
    setEditingId(item.id)
    setEditLabel(item.label ?? '')
    setEditUrl(item.url ?? '')
    setEditNewTab(item.openInNewTab)
    setEditError('')
  }

  async function saveEdit(itemId: string) {
    setEditError('')
    const item = menu?.items.find((i) => i.id === itemId)
    if (!item) return
    const body: Record<string, unknown> = { label: editLabel || null }
    if (item.type === 'EXTERNAL') {
      body.url = editUrl || null
      body.openInNewTab = editNewTab
    }
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) { setEditError(d.error ?? 'Failed to save'); return }
      setEditingId(null)
      await load()
    } catch {
      setEditError('Failed to save')
    }
  }

  async function deleteItem(itemId: string) {
    try {
      await fetch(`/api/admin/menus/${menuId}/items/${itemId}`, { method: 'DELETE' })
      setDeleteId(null)
      await load()
    } catch {
      setError('Failed to delete item')
      setDeleteId(null)
    }
  }

  async function nestUnder(itemId: string, parentId: string | null) {
    if (!menu) return
    setSaving(true)
    try {
      const items = menu.items.map((i) => ({
        id: i.id,
        parentId: i.id === itemId ? parentId : i.parentId,
        order: i.order,
      }))
      await fetch(`/api/admin/menus/${menuId}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      await load()
    } catch {
      setError('Failed to update nesting')
    } finally {
      setSaving(false)
    }
  }

  async function promoteItem(itemId: string) {
    if (!menu) return
    const item = menu.items.find((i) => i.id === itemId)
    if (!item?.parentId) return
    const parent = menu.items.find((i) => i.id === item.parentId)
    await nestUnder(itemId, parent?.parentId ?? null)
  }

  // Drag-and-drop reorder
  async function handleDrop(targetId: string) {
    if (!menu || !dragId.current || dragId.current === targetId) {
      setDragOver(null)
      dragId.current = null
      return
    }

    const flatItems = [...menu.items].sort((a, b) => a.order - b.order)
    const dragged = flatItems.find((i) => i.id === dragId.current)
    const target = flatItems.find((i) => i.id === targetId)
    if (!dragged || !target) { setDragOver(null); dragId.current = null; return }

    const without = flatItems.filter((i) => i.id !== dragId.current)
    const targetIdx = without.findIndex((i) => i.id === targetId)
    without.splice(targetIdx, 0, dragged)

    const reordered = without.map((item, idx) => ({
      id: item.id,
      parentId: item.parentId,
      order: idx,
    }))

    setSaving(true)
    setDragOver(null)
    dragId.current = null

    try {
      await fetch(`/api/admin/menus/${menuId}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reordered }),
      })
      await load()
    } catch {
      setError('Failed to reorder items')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Loading…</p>
  if (!menu) return <div className="alert alert-danger">{error || 'Menu not found'}</div>

  const topLevel = [...menu.items].filter((i) => !i.parentId).sort((a, b) => a.order - b.order)

  function ItemRow({ item, depth = 0 }: { item: MenuItemFull; depth?: number }) {
    const children = menu!.items.filter((c) => c.parentId === item.id).sort((a, b) => a.order - b.order)
    const isEditing = editingId === item.id
    const isDeleting = deleteId === item.id
    const descendants = getDescendantIds(item.id, menu!.items)
    const potentialParents = menu!.items.filter((i) => i.id !== item.id && !descendants.has(i.id))

    return (
      <>
        <tr
          draggable
          onDragStart={() => { dragId.current = item.id }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(item.id) }}
          onDrop={() => handleDrop(item.id)}
          onDragEnd={() => { setDragOver(null); dragId.current = null }}
          style={{
            background: dragOver === item.id ? 'var(--color-success-subtle)' : undefined,
            cursor: 'grab',
            opacity: dragId.current === item.id ? 0.5 : 1,
          }}
        >
          <td style={{ paddingLeft: `${depth * 2 + 0.75}rem` }}>
            {isEditing ? (
              <div>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder={item.type === 'PAGE' ? `Label override (leave empty to use page title: "${item.page?.title}")` : 'Label'}
                  style={{ width: '100%', marginBottom: '0.25rem' }}
                  autoFocus
                />
                {item.type === 'EXTERNAL' && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="URL"
                      style={{ flex: 1 }}
                    />
                    <label style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={editNewTab} onChange={(e) => setEditNewTab(e.target.checked)} />
                      New tab
                    </label>
                  </div>
                )}
                {editError && <p style={{ color: 'var(--color-destructive)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>{editError}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item.id)}>Save</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {depth > 0 && <span style={{ color: 'var(--color-border-strong)', userSelect: 'none' }}>{'└'.padStart(depth, '·')}</span>}
                <span style={{ fontWeight: 500 }}>{effectiveLabel(item)}</span>
                {item.label && item.type === 'PAGE' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>(label override)</span>
                )}
                {item.openInNewTab && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>↗ new tab</span>
                )}
              </div>
            )}
          </td>
          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {item.type === 'PAGE'
              ? (item.page ? `/${item.page.slug}` : '(deleted)')
              : item.url}
          </td>
          <td>
            <span className={`badge ${item.type === 'PAGE' ? 'badge-green' : 'badge-gray'}`}>
              {item.type === 'PAGE' ? 'Page' : 'Link'}
            </span>
          </td>
          <td>
            <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!isEditing && !isDeleting && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(item)}>Edit</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setAddParentId(item.id)}
                    title="Add child item"
                    style={{ fontSize: '0.75rem' }}
                  >
                    + Child
                  </button>
                  {depth > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => promoteItem(item.id)}
                      title="Move up one level"
                      style={{ fontSize: '0.75rem' }}
                    >
                      ↑ Promote
                    </button>
                  )}
                  {potentialParents.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) nestUnder(item.id, e.target.value) }}
                      style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                      title="Nest under…"
                    >
                      <option value="" disabled>Nest under…</option>
                      {potentialParents.map((p) => {
                        const d = getItemDepth(p.id, menu!.items)
                        const prefix = '  '.repeat(d)
                        return (
                          <option key={p.id} value={p.id}>{prefix}{effectiveLabel(p)}</option>
                        )
                      })}
                    </select>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDeleteId(item.id)}
                    style={{ color: 'var(--color-destructive)' }}
                  >
                    Delete
                  </button>
                </>
              )}
              {isDeleting && (
                <>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item.id)}>Confirm delete</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDeleteId(null)}>Cancel</button>
                </>
              )}
            </div>
          </td>
        </tr>
        {children.map((child) => (
          <ItemRow key={child.id} item={child} depth={depth + 1} />
        ))}
      </>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/${adminPath}/menus`} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'block', marginBottom: 'var(--space-1)' }}>
            ← All menus
          </Link>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{menu.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {saving && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', alignSelf: 'center' }}>Saving…</span>}
          <button className="btn btn-secondary" onClick={() => setAddMode('page')}>+ Page link</button>
          <button className="btn btn-secondary" onClick={() => setAddMode('external')}>+ External link</button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Add parent context banner */}
      {addParentId && !addMode && (
        <div style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius)', padding: 'var(--space-3) var(--space-4)', marginBottom: '1rem', fontSize: 'var(--text-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Adding a child item under <strong>{effectiveLabel(menu.items.find((i) => i.id === addParentId)!)}</strong></span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddMode('page')}>+ Page link</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddMode('external')}>+ External link</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setAddParentId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {menu.items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          This menu has no items yet. Use the buttons above to add links.
        </div>
      )}

      {menu.items.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Destination</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {topLevel.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
        Drag rows to reorder. Use &quot;+ Child&quot; to add nested items, &quot;↑ Promote&quot; to move an item up one level, or &quot;Nest under…&quot; to re-parent.
      </p>

      {/* Add item modal */}
      {(addMode === 'page' || addMode === 'external') && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => e.target === e.currentTarget && closeAddModal()}
        >
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: '90vw', maxWidth: 560, padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
                {addParentId ? 'Add child item' : 'Add menu item'}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={addMode === 'page' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setAddMode('page')}
                >Link to page</button>
                <button
                  className={addMode === 'external' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => setAddMode('external')}
                >External link</button>
                <button onClick={closeAddModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>×</button>
              </div>
            </div>

            {addError && <div className="alert alert-danger" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>{addError}</div>}

            {addMode === 'page' && (
              <>
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <input
                    value={pageSearch}
                    onChange={(e) => setPageSearch(e.target.value)}
                    placeholder="Search pages…"
                    autoFocus
                  />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
                  {pageSearchLoading && <p style={{ padding: '1rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Searching…</p>}
                  {!pageSearchLoading && pageResults.length === 0 && (
                    <p style={{ padding: '1rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      {pageSearch ? 'No matching pages' : 'No pages available (pages already in this menu are excluded)'}
                    </p>
                  )}
                  {pageResults.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => addPageItem(page)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', padding: '0.625rem 0.875rem',
                        border: 'none', borderBottom: '1px solid var(--color-bg-subtle)',
                        background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{page.title}</span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>/{page.slug}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {addMode === 'external' && (
              <>
                <div className="field">
                  <label>Label</label>
                  <input value={extLabel} onChange={(e) => setExtLabel(e.target.value)} placeholder="e.g. GitHub" autoFocus />
                </div>
                <div className="field">
                  <label>URL</label>
                  <input value={extUrl} onChange={(e) => setExtUrl(e.target.value)} placeholder="https://example.com" type="url" />
                </div>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={extNewTab} onChange={(e) => setExtNewTab(e.target.checked)} />
                  Open in new tab
                </label>
                <button
                  className="btn btn-primary"
                  onClick={addExternalItem}
                  disabled={!extLabel.trim() || !extUrl.trim()}
                >
                  Add link
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
