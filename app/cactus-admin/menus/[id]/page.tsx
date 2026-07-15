'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'

type Visibility = 'PUBLIC' | 'AUTHENTICATED' | 'GUEST' | 'ADMIN'

type MenuItemFull = {
  id: string
  menuId: string
  parentId: string | null
  type: 'PAGE' | 'EXTERNAL' | 'MODULE_ENTITY'
  pageId: string | null
  page: { id: string; title: string; slug: string; status: string } | null
  moduleId: string | null
  entityKind: string | null
  entityId: string | null
  moduleEntity: { moduleLabel: string; label: string; href: string; publiclyVisible: boolean } | null
  label: string | null
  url: string | null
  openInNewTab: boolean
  visibility: Visibility
  order: number
}

type Menu = {
  id: string
  name: string
  items: MenuItemFull[]
  isMainMenu: boolean
}

type PageResult = { id: string; title: string; slug: string; status: string }
type EntityKind = { id: string; label: string }
type ModuleEntityGroup = { moduleId: string; moduleLabel: string; kinds: EntityKind[] }
type EntitySearchResult = { id: string; label: string; hint?: string }

// Steps of the "Add item" lightbox: root (choose a source) -> a leaf picker.
// module-kinds sits between picking a module and picking a specific entity kind of that module.
type ModalStep = 'root' | 'page' | 'external' | 'module-kinds' | 'module-search' | null

// How deep nesting is allowed to go. Level 0 is a top-level item, so a cap of 2
// means three visual tiers (item > child > grandchild). Site nav dropdowns get
// unusable past that, and drag-reorder can't deepen an item, so bounding the two
// operations that can (add-child and nest-under) keeps the whole tree in range.
const MAX_DEPTH = 2

// Per-item audience presentation. PUBLIC is the default and deliberately carries
// no badge - an unbadged row reads as "everyone", which keeps ordinary menus
// clean and makes the restricted ones stand out.
const VISIBILITY_META: Record<Visibility, { label: string; short: string; badge: string | null; help: string }> = {
  PUBLIC: { label: 'Everyone', short: 'Everyone', badge: null, help: 'Shown to every visitor.' },
  AUTHENTICATED: { label: 'Signed-in visitors only', short: 'Members only', badge: 'badge-blue', help: 'Hidden until a member or admin signs in.' },
  GUEST: { label: 'Signed-out visitors only', short: 'Guests only', badge: 'badge-gray', help: 'Disappears once the visitor signs in - handy for a "Log in" link.' },
  ADMIN: { label: 'Admins only', short: 'Admins only', badge: 'badge-warning', help: 'Only visible to signed-in admin staff.' },
}
const VISIBILITY_ORDER: Visibility[] = ['PUBLIC', 'AUTHENTICATED', 'GUEST', 'ADMIN']

function effectiveLabel(item: MenuItemFull): string {
  if (item.type === 'PAGE') return item.label ?? item.page?.title ?? '(untitled)'
  if (item.type === 'MODULE_ENTITY') return item.label ?? item.moduleEntity?.label ?? '(no label)'
  return item.label ?? '(no label)'
}

function destinationText(item: MenuItemFull): string {
  if (item.type === 'PAGE') return item.page ? `/${item.page.slug}` : '(deleted)'
  if (item.type === 'MODULE_ENTITY') return item.moduleEntity ? item.moduleEntity.href : '(deleted)'
  return item.url ?? ''
}

// Where the destination text should link to when clicked: the page editor for a
// PAGE item (so you can jump straight to editing it), or the live URL in a new
// tab for external / module targets. Returns null for broken or empty targets.
function destinationLink(item: MenuItemFull, adminPath: string): { href: string; external: boolean } | null {
  if (item.type === 'PAGE') return item.page ? { href: `/${adminPath}/pages/${item.pageId}`, external: false } : null
  if (item.type === 'MODULE_ENTITY') return item.moduleEntity ? { href: item.moduleEntity.href, external: true } : null
  return item.url ? { href: item.url, external: true } : null
}

// Anything the admin ought to know is wrong or invisible about an item, so a
// link that silently vanishes on the live site (a draft page, a deleted target,
// an unpublished entity) is caught here rather than in a confused support email.
function attentionOf(item: MenuItemFull): { level: 'error' | 'warn'; text: string } | null {
  if (item.type === 'PAGE') {
    if (!item.page) return { level: 'error', text: 'Linked page deleted' }
    if (item.page.status !== 'published') return { level: 'warn', text: 'Draft page - hidden from the live site' }
  }
  if (item.type === 'MODULE_ENTITY') {
    if (!item.moduleEntity) return { level: 'error', text: 'Linked content deleted' }
    if (!item.moduleEntity.publiclyVisible) return { level: 'warn', text: 'Not published - hidden from the live site' }
  }
  return null
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

// How many levels of children hang below an item (0 for a leaf). Used with the
// item's would-be new depth to keep a nest/move from pushing any descendant past
// MAX_DEPTH.
function getSubtreeHeight(itemId: string, items: MenuItemFull[]): number {
  const children = items.filter((i) => i.parentId === itemId)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((c) => getSubtreeHeight(c.id, items)))
}

export default function MenuDetailPage() {
  const { id: menuId } = useParams<{ id: string }>()
  const pathname = usePathname()
  const adminPath = pathname.split('/')[1] ?? ''

  const [menu, setMenu] = useState<Menu | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Filter + collapse state for taming large menus
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Add item modal state
  const [modalStep, setModalStep] = useState<ModalStep>(null)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addVisibility, setAddVisibility] = useState<Visibility>('PUBLIC')
  // Page picker
  const [pageSearch, setPageSearch] = useState('')
  const [pageResults, setPageResults] = useState<PageResult[]>([])
  const [pageSearchLoading, setPageSearchLoading] = useState(false)
  // External form
  const [extLabel, setExtLabel] = useState('')
  const [extUrl, setExtUrl] = useState('')
  const [extNewTab, setExtNewTab] = useState(false)
  const [addError, setAddError] = useState('')
  // Module entity picker
  const [moduleGroups, setModuleGroups] = useState<ModuleEntityGroup[]>([])
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [selectedKind, setSelectedKind] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [entityResults, setEntityResults] = useState<EntitySearchResult[]>([])
  const [entitySearchLoading, setEntitySearchLoading] = useState(false)

  // Edit item state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editNewTab, setEditNewTab] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Per-row "more actions" kebab menu
  const [openKebabId, setOpenKebabId] = useState<string | null>(null)

  useEffect(() => {
    if (!openKebabId) return
    function handleOutsideClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(`[data-kebab-id="${openKebabId}"]`)) setOpenKebabId(null)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [openKebabId])

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

  function openAddModal(parentId: string | null = null) {
    setAddParentId(parentId)
    setAddVisibility('PUBLIC')
    setModalStep('root')
  }

  function selectModule(moduleId: string) {
    setSelectedModuleId(moduleId)
    setModalStep('module-kinds')
  }

  function selectKind(kindId: string) {
    setSelectedKind(kindId)
    setEntitySearch('')
    setModalStep('module-search')
  }

  function backToRoot() {
    setSelectedModuleId('')
    setSelectedKind('')
    setEntitySearch('')
    setEntityResults([])
    setModalStep('root')
  }

  function backToKinds() {
    setSelectedKind('')
    setEntitySearch('')
    setEntityResults([])
    setModalStep('module-kinds')
  }

  function closeModal() {
    setModalStep(null)
    setAddParentId(null)
    setAddVisibility('PUBLIC')
    setPageSearch('')
    setPageResults([])
    setExtLabel('')
    setExtUrl('')
    setExtNewTab(false)
    setAddError('')
    setSelectedModuleId('')
    setSelectedKind('')
    setEntitySearch('')
    setEntityResults([])
  }

  // Close the add-item lightbox on Escape, matching the click-outside affordance.
  useEffect(() => {
    if (modalStep === null) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalStep])

  // Load the module list (and each module's entity kinds) once the root screen opens
  useEffect(() => {
    if (modalStep !== 'root') return
    fetch('/api/admin/menus/module-entities')
      .then((res) => res.json())
      .then((d) => setModuleGroups(d.modules ?? []))
      .catch(() => setModuleGroups([]))
  }, [modalStep])

  // Page search for the page picker
  useEffect(() => {
    if (modalStep !== 'page') return
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
  }, [pageSearch, modalStep, menu])

  async function addPageItem(page: PageResult) {
    setAddError('')
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PAGE', pageId: page.id, parentId: addParentId, visibility: addVisibility }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? 'Failed to add item'); return }
      closeModal()
      await load()
    } catch {
      setAddError('Failed to add item')
    }
  }

  // Search entities once a module + kind is chosen
  useEffect(() => {
    if (modalStep !== 'module-search' || !selectedModuleId || !selectedKind) { setEntityResults([]); return }
    setEntitySearchLoading(true)
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ moduleId: selectedModuleId, kind: selectedKind, q: entitySearch })
        const res = await fetch(`/api/admin/menus/module-entities?${params}`)
        const d = await res.json()
        setEntityResults(d.results ?? [])
      } catch {
        setEntityResults([])
      } finally {
        setEntitySearchLoading(false)
      }
    }, 200)
    return () => clearTimeout(timeout)
  }, [modalStep, selectedModuleId, selectedKind, entitySearch])

  async function addModuleEntityItem(result: EntitySearchResult) {
    setAddError('')
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'MODULE_ENTITY',
          moduleId: selectedModuleId,
          entityKind: selectedKind,
          entityId: result.id,
          parentId: addParentId,
          visibility: addVisibility,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? 'Failed to add item'); return }
      closeModal()
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
        body: JSON.stringify({ type: 'EXTERNAL', label: extLabel.trim(), url: extUrl.trim(), openInNewTab: extNewTab, parentId: addParentId, visibility: addVisibility }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? 'Failed to add item'); return }
      closeModal()
      await load()
    } catch {
      setAddError('Failed to add item')
    }
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

  async function setVisibility(itemId: string, visibility: Visibility) {
    setOpenKebabId(null)
    try {
      const res = await fetch(`/api/admin/menus/${menuId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to update visibility'); return }
      await load()
    } catch {
      setError('Failed to update visibility')
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

  // Swap an item with its previous/next sibling (same parent) - keyboard- and
  // click-friendly alternative to dragging for precise reordering.
  async function moveWithinSiblings(itemId: string, direction: -1 | 1) {
    if (!menu) return
    const item = menu.items.find((i) => i.id === itemId)
    if (!item) return
    const siblings = menu.items.filter((i) => i.parentId === item.parentId).sort((a, b) => a.order - b.order)
    const idx = siblings.findIndex((i) => i.id === itemId)
    const target = siblings[idx + direction]
    if (!target) return

    setSaving(true)
    try {
      await fetch(`/api/admin/menus/${menuId}/items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: item.id, parentId: item.parentId, order: target.order },
            { id: target.id, parentId: target.parentId, order: item.order },
          ],
        }),
      })
      await load()
    } catch {
      setError('Failed to reorder items')
    } finally {
      setSaving(false)
    }
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

  function toggleCollapse(itemId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  if (loading) return <p>Loading…</p>
  if (!menu) return <div className="alert alert-danger">{error || 'Menu not found'}</div>

  const items = menu.items
  const topLevel = [...items].filter((i) => !i.parentId).sort((a, b) => a.order - b.order)
  const parentIds = new Set(items.filter((i) => i.parentId).map((i) => i.parentId))
  const activeModuleGroup = moduleGroups.find((m) => m.moduleId === selectedModuleId) ?? null
  const activeKind = activeModuleGroup?.kinds.find((k) => k.id === selectedKind) ?? null
  const modalTitle =
    modalStep === 'page' ? 'Link to a page'
    : modalStep === 'external' ? 'External link'
    : modalStep === 'module-kinds' ? (activeModuleGroup?.moduleLabel ?? 'Module content')
    : modalStep === 'module-search' ? `${activeModuleGroup?.moduleLabel ?? 'Module content'} · ${activeKind?.label ?? ''}`
    : addParentId ? 'Add child item' : 'Add menu item'

  // Summary counts for the header line
  const restrictedCount = items.filter((i) => i.visibility !== 'PUBLIC').length
  const attentionCount = items.filter((i) => attentionOf(i) !== null).length

  // Filter: keep any branch that has a match anywhere in it, so an item stays
  // visible when one of its descendants matches (and vice versa). Empty filter
  // shows everything.
  const q = filter.trim().toLowerCase()
  function itemMatches(item: MenuItemFull): boolean {
    if (!q) return true
    return `${effectiveLabel(item)} ${destinationText(item)}`.toLowerCase().includes(q)
  }
  function branchMatches(item: MenuItemFull): boolean {
    if (!q) return true
    if (itemMatches(item)) return true
    return items.filter((i) => i.parentId === item.id).some(branchMatches)
  }
  const filtering = q.length > 0
  const matchCount = filtering ? items.filter(itemMatches).length : items.length

  // A full-width selectable row used on the root and module-kinds screens of the add-item lightbox.
  function OptionRow({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem',
          width: '100%', padding: '0.75rem 1rem',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
          background: 'var(--color-surface)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.125rem' }}>
          <span style={{ fontWeight: 500 }}>{title}</span>
          {subtitle && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{subtitle}</span>}
        </span>
        <span style={{ color: 'var(--color-text-muted)' }} aria-hidden>›</span>
      </button>
    )
  }

  // Audience picker reused in the add-item lightbox (leaf steps) so the visitor
  // group can be chosen at creation, not only after the fact.
  function VisibilityPicker() {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Who can see this?</span>
        <select
          value={addVisibility}
          onChange={(e) => setAddVisibility(e.target.value as Visibility)}
          style={{ padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        >
          {VISIBILITY_ORDER.map((v) => (
            <option key={v} value={v}>{VISIBILITY_META[v].label}</option>
          ))}
        </select>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{VISIBILITY_META[addVisibility].help}</span>
      </label>
    )
  }

  function ItemRow({ item, depth = 0 }: { item: MenuItemFull; depth?: number }) {
    const allChildren = items.filter((c) => c.parentId === item.id).sort((a, b) => a.order - b.order)
    const children = filtering ? allChildren.filter(branchMatches) : allChildren
    const isEditing = editingId === item.id
    const isDeleting = deleteId === item.id
    const descendants = getDescendantIds(item.id, items)
    const subtreeHeight = getSubtreeHeight(item.id, items)
    // Valid nest targets: not self, not a descendant, and moving here (plus this
    // item's own subtree) must stay within MAX_DEPTH.
    const potentialParents = items.filter(
      (i) => i.id !== item.id && !descendants.has(i.id) && getItemDepth(i.id, items) + 1 + subtreeHeight <= MAX_DEPTH
    )
    const canAddChild = depth < MAX_DEPTH

    const siblings = items.filter((i) => i.parentId === item.parentId).sort((a, b) => a.order - b.order)
    const siblingIdx = siblings.findIndex((i) => i.id === item.id)
    const kebabOpen = openKebabId === item.id
    const hasChildren = allChildren.length > 0
    // Collapse is ignored while filtering, so matching descendants are never hidden.
    const isCollapsed = !filtering && collapsed.has(item.id)

    const attention = attentionOf(item)
    const vis = VISIBILITY_META[item.visibility]
    const destLink = destinationLink(item, adminPath)

    return (
      <>
        <tr
          onDragOver={(e) => { e.preventDefault(); setDragOver(item.id) }}
          onDrop={() => handleDrop(item.id)}
          style={{
            background: dragOver === item.id ? 'var(--color-success-subtle)' : undefined,
            opacity: dragId.current === item.id ? 0.5 : 1,
          }}
        >
          <td style={{ width: '1.5rem', padding: 0, textAlign: 'center' }}>
            <span
              draggable={!filtering}
              onDragStart={() => { if (!filtering) dragId.current = item.id }}
              onDragEnd={() => { setDragOver(null); dragId.current = null }}
              title={filtering ? 'Clear the filter to reorder' : 'Drag to reorder'}
              aria-hidden
              style={{ cursor: filtering ? 'default' : 'grab', color: 'var(--color-text-muted)', display: 'inline-block', opacity: filtering ? 0.35 : 1 }}
            >
              ⠿
            </span>
          </td>
          <td style={{ paddingLeft: `${depth * 1.5 + 0.75}rem`, position: 'relative' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                {hasChildren && !filtering ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    aria-expanded={!isCollapsed}
                    title={isCollapsed ? `Expand (${allChildren.length})` : 'Collapse'}
                    onClick={() => toggleCollapse(item.id)}
                    style={{ padding: '0 0.25rem', minWidth: 0, color: 'var(--color-text-muted)' }}
                  >
                    {isCollapsed ? '▸' : '▾'}
                  </button>
                ) : depth > 0 ? (
                  <span aria-hidden style={{ color: 'var(--color-text-muted)', userSelect: 'none' }}>↳</span>
                ) : null}
                <span style={{ fontWeight: 500 }}>{effectiveLabel(item)}</span>
                {isCollapsed && hasChildren && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>({allChildren.length})</span>
                )}
                {item.label && item.type === 'PAGE' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>(label override)</span>
                )}
                {item.openInNewTab && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>↗ new tab</span>
                )}
                {vis.badge && (
                  <span className={`badge ${vis.badge}`} title={vis.help}>{vis.short}</span>
                )}
                {attention && (
                  <span
                    className={`badge ${attention.level === 'error' ? 'badge-danger' : 'badge-warning'}`}
                    title={attention.text}
                  >
                    {attention.level === 'error' ? '⚠ ' : ''}{attention.text}
                  </span>
                )}
              </div>
            )}
          </td>
          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {destLink ? (
              destLink.external ? (
                <a href={destLink.href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-muted)' }}>
                  {destinationText(item)} ↗
                </a>
              ) : (
                <Link href={destLink.href} style={{ color: 'var(--color-text-muted)' }}>{destinationText(item)}</Link>
              )
            ) : (
              destinationText(item)
            )}
          </td>
          <td>
            <span className={`badge ${item.type === 'PAGE' ? 'badge-green' : item.type === 'MODULE_ENTITY' ? 'badge-blue' : 'badge-gray'}`}>
              {item.type === 'PAGE' ? 'Page' : item.type === 'MODULE_ENTITY' ? (item.moduleEntity?.moduleLabel ?? 'Module') : 'Link'}
            </span>
          </td>
          <td>
            <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', alignItems: 'center' }}>
              {!isEditing && !isDeleting && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label="Move up"
                    title={filtering ? 'Clear the filter to reorder' : 'Move up'}
                    disabled={filtering || siblingIdx <= 0}
                    onClick={() => moveWithinSiblings(item.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    aria-label="Move down"
                    title={filtering ? 'Clear the filter to reorder' : 'Move down'}
                    disabled={filtering || siblingIdx === -1 || siblingIdx >= siblings.length - 1}
                    onClick={() => moveWithinSiblings(item.id, 1)}
                  >
                    ↓
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(item)}>Edit</button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setDeleteId(item.id)}
                    style={{ color: 'var(--color-destructive)' }}
                  >
                    Delete
                  </button>
                  <div data-kebab-id={item.id} style={{ position: 'relative' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label="More actions"
                      aria-expanded={kebabOpen}
                      onClick={() => setOpenKebabId(kebabOpen ? null : item.id)}
                    >
                      ⋯
                    </button>
                    {kebabOpen && (
                      <div
                        role="menu"
                        style={{
                          position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem', zIndex: 20,
                          width: 260, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
                          padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
                        }}
                      >
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', padding: '0.25rem 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Who can see this
                        </div>
                        {VISIBILITY_ORDER.map((v) => (
                          <button
                            key={v}
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: 'space-between', fontWeight: item.visibility === v ? 600 : 400 }}
                            onClick={() => setVisibility(item.id, v)}
                          >
                            <span>{VISIBILITY_META[v].label}</span>
                            {item.visibility === v && <span aria-hidden>✓</span>}
                          </button>
                        ))}
                        <div style={{ height: 1, background: 'var(--color-border)', margin: '0.25rem 0' }} />
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ justifyContent: 'flex-start' }}
                          disabled={!canAddChild}
                          title={canAddChild ? undefined : `Menus only nest ${MAX_DEPTH + 1} levels deep`}
                          onClick={() => { setOpenKebabId(null); openAddModal(item.id) }}
                        >
                          + Add child item
                        </button>
                        {depth > 0 && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ justifyContent: 'flex-start' }}
                            onClick={() => { setOpenKebabId(null); promoteItem(item.id) }}
                          >
                            ↰ Promote one level
                          </button>
                        )}
                        {potentialParents.length > 0 && (
                          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', padding: '0.25rem 0.5rem 0' }}>
                            Nest under…
                            <select
                              defaultValue=""
                              onChange={(e) => { if (e.target.value) { nestUnder(item.id, e.target.value); setOpenKebabId(null) } }}
                              style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' }}
                            >
                              <option value="" disabled>Choose a parent…</option>
                              {potentialParents.map((p) => {
                                const d = getItemDepth(p.id, items)
                                const prefix = '  '.repeat(d)
                                return (
                                  <option key={p.id} value={p.id}>{prefix}{effectiveLabel(p)}</option>
                                )
                              })}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
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
        {!isCollapsed && children.map((child) => (
          <ItemRow key={child.id} item={child} depth={depth + 1} />
        ))}
      </>
    )
  }

  const visibleTopLevel = filtering ? topLevel.filter(branchMatches) : topLevel

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/${adminPath}/menus`} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textDecoration: 'none', display: 'block', marginBottom: 'var(--space-1)' }}>
            ← All menus
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <h1 className="page-title" style={{ marginBottom: 0 }}>{menu.name}</h1>
            {menu.isMainMenu && <span className="badge badge-success">Main menu</span>}
          </div>
          {items.length > 0 && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 'var(--space-1) 0 0' }}>
              {items.length} item{items.length === 1 ? '' : 's'}
              {restrictedCount > 0 && <> · {restrictedCount} with limited visibility</>}
              {attentionCount > 0 && <> · <span style={{ color: 'var(--color-warning)' }}>{attentionCount} need attention</span></>}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {saving && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', alignSelf: 'center' }}>Saving…</span>}
          <button className="btn btn-primary" onClick={() => openAddModal(null)}>+ Add item</button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
          <button type="button" aria-label="Dismiss" onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}

      {menu.items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          This menu has no items yet. Use &quot;+ Add item&quot; above to add links.
        </div>
      )}

      {menu.items.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter items by label or link…"
              aria-label="Filter items"
              style={{ flex: '1 1 240px', maxWidth: 360 }}
            />
            {filtering && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                {matchCount} match{matchCount === 1 ? '' : 'es'}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('')} style={{ marginLeft: '0.25rem' }}>Clear</button>
              </span>
            )}
            {!filtering && parentIds.size > 0 && (
              <div style={{ display: 'flex', gap: '0.25rem', marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCollapsed(new Set(Array.from(parentIds).filter((id): id is string => !!id)))}
                >
                  Collapse all
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCollapsed(new Set())}>Expand all</button>
              </div>
            )}
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Label</th>
                  <th>Destination</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleTopLevel.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
                {filtering && visibleTopLevel.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem' }}>No items match &quot;{filter}&quot;.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
        Drag <span aria-hidden>⠿</span> or use the arrows to reorder. Open <span aria-hidden>⋯</span> on an item to set who can see it, nest it, or add a child. Menus nest up to {MAX_DEPTH + 1} levels deep.
      </p>

      {/* Add item lightbox */}
      {modalStep !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', width: '90vw', maxWidth: 560, padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {modalStep !== 'root' && (
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={modalStep === 'module-search' ? backToKinds : backToRoot}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1, padding: 0 }}
                  >
                    ←
                  </button>
                )}
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{modalTitle}</h2>
                  {addParentId && (
                    <p style={{ margin: '0.125rem 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                      Adding under <strong>{effectiveLabel(menu.items.find((i) => i.id === addParentId)!)}</strong>
                    </p>
                  )}
                </div>
              </div>
              <button type="button" aria-label="Close" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>×</button>
            </div>

            {addError && <div className="alert alert-danger" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>{addError}</div>}

            {modalStep === 'root' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <OptionRow title="Page" subtitle="Link to one of your site's pages" onClick={() => setModalStep('page')} />
                {moduleGroups.map((m) => (
                  <OptionRow key={m.moduleId} title={m.moduleLabel} subtitle={`Link to ${m.moduleLabel} content`} onClick={() => selectModule(m.moduleId)} />
                ))}
                <OptionRow title="External link" subtitle="Link to any other web address" onClick={() => setModalStep('external')} />
              </div>
            )}

            {modalStep === 'module-kinds' && activeModuleGroup && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {activeModuleGroup.kinds.map((k) => (
                  <OptionRow key={k.id} title={k.label} onClick={() => selectKind(k.id)} />
                ))}
              </div>
            )}

            {modalStep === 'page' && (
              <>
                <VisibilityPicker />
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

            {modalStep === 'module-search' && (
              <>
                <VisibilityPicker />
                <div className="field" style={{ marginBottom: '0.5rem' }}>
                  <input
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Search…"
                    autoFocus
                  />
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}>
                  {entitySearchLoading && <p style={{ padding: '1rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>Searching…</p>}
                  {!entitySearchLoading && entityResults.length === 0 && (
                    <p style={{ padding: '1rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>No matches</p>
                  )}
                  {entityResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => addModuleEntityItem(result)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        width: '100%', padding: '0.625rem 0.875rem',
                        border: 'none', borderBottom: '1px solid var(--color-bg-subtle)',
                        background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{result.label}</span>
                      {result.hint && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{result.hint}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {modalStep === 'external' && (
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
                <VisibilityPicker />
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
