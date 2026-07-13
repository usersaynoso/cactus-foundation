'use client'

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MediaCard from './MediaCard'
import MediaList from './MediaList'
import MediaDetailPanel from './MediaDetailPanel'
import MediaImageEditor from './MediaImageEditor'
import MediaUpload from './MediaUpload'
import MediaStatsBar, { type LibraryStats } from './MediaStatsBar'
import MediaToolbar from './MediaToolbar'
import MediaToasts, { type Toast, type ToastKind } from './MediaToasts'
import FolderTree, { type FolderNode } from './FolderTree'
import { uploadOneFile } from '@/lib/media/upload-client'
import type { LibraryItem, TagInfo, Sort, TypeFilter, UseFilter, ViewMode } from './types'

type Clipboard = { mode: 'cut' | 'copy'; ids: string[] } | null
type Menu = { x: number; y: number; id: string } | null
type CollisionState =
  | { kind: 'rename'; id: string; newName: string; name: string }
  | { kind: 'move'; ids: string[]; targetFolderId: string | null; name: string }
  | null

const VIEW_KEY = 'cactus.media.view'

export default function MediaLibrary({
  initialItems,
  initialHasMore,
  folders: initialFolders,
  rootCount: initialRootCount,
  tags: initialTags,
  stats,
  canUpload,
  canDelete,
  perPage,
}: {
  initialItems: LibraryItem[]
  initialHasMore: boolean
  initialTotal: number
  folders: FolderNode[]
  rootCount: number
  tags: TagInfo[]
  stats: LibraryStats
  canUpload: boolean
  canDelete: boolean
  perPage: number
}) {
  const [folders, setFolders] = useState<FolderNode[]>(initialFolders)
  const [rootCount, setRootCount] = useState(initialRootCount)
  const [tags, setTags] = useState<TagInfo[]>(initialTags)

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  // Forces the whole-library scope (all folders) even without a search/tag -
  // set when a stat tile is clicked, cleared as soon as a folder is browsed.
  const [browseAll, setBrowseAll] = useState(false)
  const [items, setItems] = useState<LibraryItem[]>(initialItems)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [sort, setSort] = useState<Sort>('newest')
  const [type, setType] = useState<TypeFilter>('all')
  const [use, setUse] = useState<UseFilter>('all')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [view, setView] = useState<ViewMode>('grid')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastToggled, setLastToggled] = useState<number | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [busy, setBusy] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [optimisingIds, setOptimisingIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null)
  const [skippedInUse, setSkippedInUse] = useState<{ id: string; references: string[] }[]>([])

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<LibraryItem | null>(null)
  const [renameFolderNode, setRenameFolderNode] = useState<FolderNode | null>(null)
  const [deleteFolderNode, setDeleteFolderNode] = useState<FolderNode | null>(null)
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  const [editItem, setEditItem] = useState<LibraryItem | null>(null)
  const [collision, setCollision] = useState<CollisionState>(null)

  // --- toasts ---
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)
  const pushToast = useCallback((kind: ToastKind, msg: string) => {
    const id = ++toastSeq.current
    setToasts((prev) => [...prev, { id, kind, msg }])
    if (kind !== 'busy') setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])
  const allToasts = useMemo<Toast[]>(() => (busy ? [...toasts, { id: -1, kind: 'busy', msg: busy }] : toasts), [toasts, busy])

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Restore the saved grid/list preference once, on the client. Must run in an
  // effect, not a lazy initializer: reading localStorage during render would
  // diverge from the server's default and trip a hydration mismatch.
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydrate of a persisted UI pref; safe one-shot re-render
    if (saved === 'grid' || saved === 'list') setView(saved)
  }, [])
  useEffect(() => { window.localStorage.setItem(VIEW_KEY, view) }, [view])

  // A search, tag filter or stat-tile drill-down spans the whole tree; plain
  // folder browsing scopes to one folder.
  const folderScope = search || tagFilter || browseAll ? 'all' : currentFolderId ?? 'root'

  const buildQuery = useCallback(
    (pageNum: number) => {
      const qs = new URLSearchParams({ page: String(pageNum), perPage: String(perPage), sort })
      qs.set('folder', folderScope)
      if (type !== 'all') qs.set('type', type)
      if (use !== 'all') qs.set('filter', use)
      if (tagFilter) qs.set('tag', tagFilter)
      if (search) qs.set('q', search)
      return qs.toString()
    },
    [perPage, sort, folderScope, type, use, tagFilter, search],
  )

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/media?${buildQuery(1)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to load media')
      setItems(d.items)
      setHasMore(d.hasMore)
      setPage(1)
      setSelected(new Set())
      setLastToggled(null)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [buildQuery, pushToast])

  // Reload whenever the query changes. Skips the first run - the server already
  // provided the root's first page as initialItems.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    fetchItems()
  }, [fetchItems])

  const refetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media/folders')
      const d = await res.json()
      if (res.ok) { setFolders(d.folders); setRootCount(d.rootCount) }
    } catch { /* leave the tree as-is on a transient error */ }
  }, [])

  const refetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media/tags')
      const d = await res.json()
      if (res.ok) setTags(d.tags)
    } catch { /* ignore */ }
  }, [])

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const next = page + 1
      const res = await fetch(`/api/admin/media?${buildQuery(next)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to load more')
      setItems((prev) => [...prev, ...d.items])
      setPage(next)
      setHasMore(d.hasMore)
    } catch { /* sentinel retries on next scroll */ } finally { setLoading(false) }
  }

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) loadMore() },
      { rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMore closes over page/loading; re-attach only when hasMore changes
  }, [hasMore, page, loading])

  // Dismiss the context menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey) }
  }, [menu])

  // --- navigation ---
  const navigateFolder = useCallback((id: string | null) => {
    setSearch(''); setSearchInput(''); setTagFilter(''); setBrowseAll(false); setCurrentFolderId(id)
  }, [])

  // --- selection ---
  function toggleSelect(id: string, shiftKey: boolean) {
    const index = items.findIndex((i) => i.id === id)
    if (shiftKey && lastToggled !== null) {
      const [start, end] = index < lastToggled ? [index, lastToggled] : [lastToggled, index]
      const range = items.slice(start, end + 1).map((i) => i.id)
      setSelected((prev) => { const n = new Set(prev); range.forEach((r) => n.add(r)); return n })
    } else {
      setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    }
    setLastToggled(index)
  }
  const allShownSelected = items.length > 0 && items.every((i) => selected.has(i.id))
  function toggleSelectAll() {
    setSelected((prev) => (items.every((i) => prev.has(i.id)) ? new Set() : new Set(items.map((i) => i.id))))
  }

  const openIndex = openId ? items.findIndex((i) => i.id === openId) : -1
  const openItem = openIndex >= 0 ? items[openIndex] : null

  // --- drag and drop ---
  // Safari doesn't expose dataTransfer.types during dragover, so this ref is the
  // reliable "an internal card drag is in flight" signal for the grid dropzone.
  const draggingInternal = useRef(false)
  function onDragStart(e: React.DragEvent, id: string) {
    const ids = selected.has(id) ? Array.from(selected) : [id]
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = 'move'
    draggingInternal.current = true
  }
  function onDragEnd() { draggingInternal.current = false }
  async function onDropToFolder(targetFolderId: string | null, raw: string) {
    const ids = raw.split(',').filter(Boolean)
    if (ids.length === 0) return
    await performMove(ids, targetFolderId, 'error')
  }

  // --- mutations ---
  async function performMove(ids: string[], targetFolderId: string | null, mode: 'error' | 'suffix' | 'replace' | 'skip') {
    setBusy('Moving…')
    try {
      const res = await fetch('/api/admin/media/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, targetFolderId, collision: mode }),
      })
      const d = await res.json()
      if (res.status === 409 && d.collision) { setCollision({ kind: 'move', ids, targetFolderId, name: d.name }); return }
      if (!res.ok) throw new Error(d.error ?? 'Move failed')
      setCollision(null)
      setSelected(new Set())
      pushToast('success', `Moved ${ids.length} item${ids.length === 1 ? '' : 's'}`)
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Move failed')
      await Promise.all([fetchItems(), refetchFolders()])
    } finally { setBusy('') }
  }

  async function performMoveFolder(folderId: string, targetParentId: string | null) {
    const node = folders.find((f) => f.id === folderId)
    if (!node) return
    if (targetParentId === (node.parentId ?? null)) return
    if (targetParentId === folderId || isDescendant(folders, folderId, targetParentId)) {
      pushToast('error', "A folder can't be moved inside itself"); return
    }
    setBusy('Moving folder…')
    try {
      const res = await fetch(`/api/admin/media/folders/${folderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: targetParentId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Move failed')
      await Promise.all([refetchFolders(), fetchItems()])
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Move failed') } finally { setBusy('') }
  }

  async function performRename(id: string, newName: string, mode: 'error' | 'suffix' | 'replace') {
    setBusy('Renaming…')
    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName, collision: mode }),
      })
      const d = await res.json()
      if (res.status === 409 && d.collision) { setCollision({ kind: 'rename', id, newName, name: d.name }); return }
      if (!res.ok) throw new Error(d.error ?? 'Rename failed')
      setCollision(null)
      setRenameItem(null)
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Rename failed') } finally { setBusy('') }
  }

  async function paste(targetFolderId: string | null) {
    if (!clipboard) return
    setBusy(clipboard.mode === 'cut' ? 'Moving…' : 'Pasting…')
    try {
      if (clipboard.mode === 'cut') {
        await performMove(clipboard.ids, targetFolderId, 'error')
      } else {
        const res = await fetch('/api/admin/media/duplicate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: clipboard.ids, targetFolderId }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Paste failed')
        await Promise.all([fetchItems(), refetchFolders()])
      }
      setClipboard(null)
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Paste failed')
      await Promise.all([fetchItems(), refetchFolders()])
    } finally { setBusy('') }
  }

  // First pass without force reports any items still referenced elsewhere so the
  // admin can reconsider before forcing.
  async function runDelete(ids: string[], force: boolean) {
    if (ids.length === 0) return
    setBusy('Deleting…')
    try {
      const res = await fetch('/api/admin/media/bulk-delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, force }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      if (d.skipped?.length > 0 && !force) {
        setSkippedInUse(d.skipped)
        setDeleteConfirm({ ids: d.skipped.map((s: { id: string }) => s.id) })
      } else {
        setDeleteConfirm(null); setSkippedInUse([]); setSelected(new Set())
        if (openId && ids.includes(openId)) setOpenId(null)
        pushToast('success', `Deleted ${ids.length} item${ids.length === 1 ? '' : 's'}`)
      }
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Delete failed') } finally { setBusy('') }
  }

  async function optimiseSingle(id: string) {
    setOptimisingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/admin/media/${id}/optimise`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Optimise failed')
      pushToast('success', 'Image optimised')
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Optimise failed') }
    finally { setOptimisingIds((prev) => { const n = new Set(prev); n.delete(id); return n }) }
  }

  async function optimiseBulk() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBusy('Optimising…')
    try {
      const res = await fetch('/api/admin/media/bulk-optimise', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Optimise failed')
      setSelected(new Set())
      pushToast('success', `Optimised ${ids.length} item${ids.length === 1 ? '' : 's'}`)
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Optimise failed') } finally { setBusy('') }
  }

  async function saveTags(item: LibraryItem, names: string[]) {
    setSavingTags(true)
    try {
      const res = await fetch(`/api/admin/media/${item.id}/tags`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: names }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save tags')
      pushToast('success', 'Tags saved')
      await Promise.all([fetchItems(), refetchTags()])
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Could not save tags') } finally { setSavingTags(false) }
  }

  // Upload files dropped onto the grid or a folder row. Defaults to the open
  // folder; a sidebar drop passes the row's folder instead.
  async function uploadFiles(files: FileList, targetFolderId: string | null = currentFolderId) {
    const list = Array.from(files)
    if (list.length === 0) return
    setBusy('Uploading…')
    try {
      for (const file of list) await uploadOneFile(file, targetFolderId)
      pushToast('success', `Uploaded ${list.length} file${list.length === 1 ? '' : 's'}`)
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Upload failed')
      await Promise.all([fetchItems(), refetchFolders()])
    } finally { setBusy('') }
  }

  const currentTrail = useMemo(() => trailFor(currentFolderId, folders), [currentFolderId, folders])
  const clipboardIdSet = useMemo(() => new Set(clipboard?.mode === 'cut' ? clipboard.ids : []), [clipboard])
  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders])
  const folderName = useCallback((id: string | null) => (id ? folderNameById.get(id) ?? '—' : 'Media'), [folderNameById])

  const activeFilter: 'all' | 'unused' | 'optimisable' | 'other' =
    use === 'unused' ? 'unused'
    : browseAll && type === 'image' ? 'optimisable'
    : browseAll && type === 'all' && use === 'all' && !tagFilter && !search ? 'all'
    : 'other'

  function clearAllFilters() {
    setSearch(''); setSearchInput(''); setTagFilter(''); setType('all'); setUse('all')
  }

  const selectionActive = selected.size > 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Media library</h1>
        {canUpload && <MediaUpload folderId={currentFolderId} onUploaded={() => { fetchItems(); refetchFolders() }} />}
      </div>

      <MediaStatsBar
        stats={stats}
        folderCount={folders.length}
        activeFilter={activeFilter}
        onShowAll={() => { clearAllFilters(); setBrowseAll(true); setCurrentFolderId(null) }}
        onShowUnused={() => { setSearch(''); setSearchInput(''); setTagFilter(''); setType('all'); setUse('unused'); setBrowseAll(true) }}
        onShowOptimisable={() => { setSearch(''); setSearchInput(''); setTagFilter(''); setUse('all'); setType('image'); setBrowseAll(true) }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <FolderTree
          folders={folders}
          rootCount={rootCount}
          currentFolderId={currentFolderId}
          browsingAll={browseAll || !!search || !!tagFilter}
          canManage={canUpload}
          canDelete={canDelete}
          onNavigate={navigateFolder}
          onDropItems={onDropToFolder}
          onDropFiles={(folderId, files) => uploadFiles(files, folderId)}
          onMoveFolder={performMoveFolder}
          onNewFolder={() => setNewFolderOpen(true)}
          onRenameFolder={(f) => setRenameFolderNode(f)}
          onDeleteFolder={(f) => setDeleteFolderNode(f)}
        />

        <div
          // minHeight makes the whole panel a file-drop target, not just the rows
          // the images fill - so dropping into empty space still uploads.
          style={{ position: 'relative', minHeight: '60vh' }}
          onDragOver={canUpload ? (e) => {
            if (draggingInternal.current) return
            e.preventDefault(); setFileDragOver(true)
          } : undefined}
          onDragLeave={canUpload ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDragOver(false) } : undefined}
          onDrop={canUpload ? (e) => {
            setFileDragOver(false)
            if (e.dataTransfer.files.length > 0) { e.preventDefault(); uploadFiles(e.dataTransfer.files) }
          } : undefined}
        >
          {fileDragOver && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--color-primary)', borderRadius: 'var(--radius)', background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: 'var(--text-base)', fontWeight: 600, pointerEvents: 'none' }}>
              Drop to upload{currentTrail.length > 0 && !browseAll && !search && !tagFilter ? ` to ${currentTrail[currentTrail.length - 1]?.name}` : ''}
            </div>
          )}

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: 'var(--text-sm)' }}>
            <BreadcrumbCrumb label="Media" onClick={() => navigateFolder(null)} onDrop={(raw) => onDropToFolder(null, raw)} active={currentFolderId === null && !search && !tagFilter && !browseAll} />
            {!browseAll && !search && !tagFilter && currentTrail.map((f) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <BreadcrumbCrumb label={f.name} onClick={() => navigateFolder(f.id)} onDrop={(raw) => onDropToFolder(f.id, raw)} active={f.id === currentFolderId} />
              </span>
            ))}
            {(browseAll || search || tagFilter) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>All folders</span>
              </span>
            )}
          </div>

          <MediaToolbar
            searchInput={searchInput}
            onSearchInput={setSearchInput}
            onSearchSubmit={(value) => { setTagFilter(''); setSearch((value ?? searchInput).trim()) }}
            sort={sort}
            onSort={setSort}
            type={type}
            onType={setType}
            use={use}
            onUse={setUse}
            tagFilter={tagFilter}
            onTagFilter={(v) => { setTagFilter(v); if (v) { setSearch(''); setSearchInput('') } }}
            tags={tags}
            view={view}
            onView={setView}
            activeSearch={search}
            onClearAll={clearAllFilters}
          />

          {/* Selection / clipboard bar */}
          {(selectionActive || clipboard) && (
            <div style={barStyle}>
              {selectionActive && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{selected.size} selected</span>}
              {selectionActive && canUpload && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'cut', ids: Array.from(selected) })}>Cut</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'copy', ids: Array.from(selected) })}>Copy</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoveIds(Array.from(selected))}>Move to…</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={optimiseBulk}>Optimise</button>
                </>
              )}
              {selectionActive && canDelete && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => { setSkippedInUse([]); setDeleteConfirm({ ids: Array.from(selected) }) }}>Delete</button>
              )}
              {clipboard && canUpload && (
                <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => paste(currentFolderId)}>
                  Paste {clipboard.ids.length} here ({clipboard.mode})
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { setSelected(new Set()); setClipboard(null) }}>Clear</button>
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState loading={loading} search={search} canUpload={canUpload} />
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '1rem' }}>
              {items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  selectionActive={selectionActive}
                  selected={selected.has(item.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setOpenId}
                  draggable={canUpload}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onContextMenu={(e, id) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id }) }}
                  tags={item.tags}
                  dimmed={clipboardIdSet.has(item.id)}
                />
              ))}
            </div>
          ) : (
            <MediaList
              items={items}
              selected={selected}
              allSelected={allShownSelected}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleSelectAll}
              onOpen={setOpenId}
              onContextMenu={(e, id) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id }) }}
              draggable={canUpload}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              sort={sort}
              onSort={setSort}
              folderName={folderName}
              clipboardIdSet={clipboardIdSet}
            />
          )}

          {hasMore && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              {loading ? 'Loading more…' : ''}
            </div>
          )}
        </div>
      </div>

      {openItem && (
        <MediaDetailPanel
          key={openItem.id}
          item={openItem}
          canManage={canUpload}
          canDelete={canDelete}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < items.length - 1}
          loadingNext={loading}
          allTags={tags}
          folderName={folderName}
          savingTags={savingTags}
          optimising={optimisingIds.has(openItem.id)}
          onClose={() => setOpenId(null)}
          onPrev={() => { const p = items[openIndex - 1]; if (p) setOpenId(p.id) }}
          onNext={() => { const n = items[openIndex + 1]; if (n) setOpenId(n.id) }}
          onEdit={() => { setEditItem(openItem); setOpenId(null) }}
          onRename={() => setRenameItem(openItem)}
          onMove={() => setMoveIds([openItem.id])}
          onCut={() => { setClipboard({ mode: 'cut', ids: [openItem.id] }); setOpenId(null) }}
          onCopy={() => { setClipboard({ mode: 'copy', ids: [openItem.id] }); setOpenId(null) }}
          onDelete={() => { setSkippedInUse([]); setDeleteConfirm({ ids: [openItem.id] }) }}
          onOptimise={() => optimiseSingle(openItem.id)}
          onSaveTags={(names) => saveTags(openItem, names)}
        />
      )}

      {editItem && (
        <MediaImageEditor
          item={editItem}
          onCancel={() => setEditItem(null)}
          onSaved={(mode) => {
            setEditItem(null)
            pushToast('success', mode === 'new' ? 'Saved new image' : 'Replaced image')
            Promise.all([fetchItems(), refetchFolders()])
          }}
        />
      )}

      {menu && (
        <ContextMenu
          menu={menu}
          canUpload={canUpload}
          canDelete={canDelete}
          hasClipboard={!!clipboard}
          canEdit={(() => { const it = items.find((i) => i.id === menu.id); return !!it && it.mimeType.startsWith('image/') && it.mimeType !== 'image/svg+xml' })()}
          canOptimise={(() => { const it = items.find((i) => i.id === menu.id); return !!it && it.mimeType.startsWith('image/') && it.mimeType !== 'image/svg+xml' && !it.optimised })()}
          onOpen={() => setOpenId(menu.id)}
          onOptimise={() => optimiseSingle(menu.id)}
          onCut={() => setClipboard({ mode: 'cut', ids: selected.has(menu.id) ? Array.from(selected) : [menu.id] })}
          onCopy={() => setClipboard({ mode: 'copy', ids: selected.has(menu.id) ? Array.from(selected) : [menu.id] })}
          onPaste={() => paste(currentFolderId)}
          onRename={() => { const it = items.find((i) => i.id === menu.id); if (it) setRenameItem(it) }}
          onMove={() => setMoveIds(selected.has(menu.id) ? Array.from(selected) : [menu.id])}
          onTags={() => setOpenId(menu.id)}
          onEdit={() => { const it = items.find((i) => i.id === menu.id); if (it) setEditItem(it) }}
          onDelete={() => { setSkippedInUse([]); setDeleteConfirm({ ids: selected.has(menu.id) ? Array.from(selected) : [menu.id] }) }}
        />
      )}

      {newFolderOpen && (
        <NameDialog
          title="New folder" label="Folder name" confirmLabel="Create"
          onCancel={() => setNewFolderOpen(false)}
          onSubmit={async (name) => {
            setBusy('Creating folder…')
            try {
              const res = await fetch('/api/admin/media/folders', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parentId: currentFolderId }),
              })
              const d = await res.json()
              if (!res.ok) throw new Error(d.error ?? 'Could not create folder')
              setNewFolderOpen(false)
              await refetchFolders()
            } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Could not create folder') } finally { setBusy('') }
          }}
        />
      )}

      {renameFolderNode && (
        <NameDialog
          title="Rename folder" label="Folder name" confirmLabel="Rename" initial={renameFolderNode.name}
          onCancel={() => setRenameFolderNode(null)}
          onSubmit={async (name) => {
            setBusy('Renaming folder…')
            try {
              const res = await fetch(`/api/admin/media/folders/${renameFolderNode.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
              })
              const d = await res.json()
              if (!res.ok) throw new Error(d.error ?? 'Rename failed')
              setRenameFolderNode(null)
              await Promise.all([refetchFolders(), fetchItems()])
            } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Rename failed') } finally { setBusy('') }
          }}
        />
      )}

      {renameItem && (
        <NameDialog
          title="Rename file" label="Filename" confirmLabel="Rename" initial={renameItem.originalName ?? ''}
          onCancel={() => setRenameItem(null)}
          onSubmit={(name) => performRename(renameItem.id, name, 'error')}
        />
      )}

      {deleteFolderNode && (
        <DeleteFolderDialog
          folder={deleteFolderNode}
          onCancel={() => setDeleteFolderNode(null)}
          onConfirm={async () => {
            setBusy('Deleting folder…')
            try {
              const res = await fetch(`/api/admin/media/folders/${deleteFolderNode.id}`, { method: 'DELETE' })
              const d = await res.json()
              if (!res.ok) throw new Error(d.error ?? 'Delete failed')
              const deletedId = deleteFolderNode.id
              setDeleteFolderNode(null)
              if (currentFolderId === deletedId) setCurrentFolderId(null)
              await Promise.all([refetchFolders(), fetchItems()])
            } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Delete failed') } finally { setBusy('') }
          }}
        />
      )}

      {moveIds && (
        <MoveDialog
          folders={folders} currentFolderId={currentFolderId}
          onCancel={() => setMoveIds(null)}
          onSubmit={(target) => { const ids = moveIds; setMoveIds(null); performMove(ids, target, 'error') }}
        />
      )}

      {deleteConfirm && (
        <Overlay onCancel={() => { setDeleteConfirm(null); setSkippedInUse([]) }}>
          <h2 style={dialogTitle}>
            {skippedInUse.length > 0 ? 'Some items are still in use' : `Delete ${deleteConfirm.ids.length} item${deleteConfirm.ids.length === 1 ? '' : 's'}?`}
          </h2>
          {skippedInUse.length > 0 ? (
            <>
              <p style={dialogText}>These are referenced elsewhere on the site. Deleting them may break what uses them.</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--text-sm)', display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 160, overflow: 'auto' }}>
                {skippedInUse.map((s) => {
                  const it = items.find((i) => i.id === s.id)
                  const label = it ? (it.originalName || it.key.split('/').pop() || it.id) : s.id
                  return <li key={s.id}><strong>{label}</strong>: {s.references.join(', ')}</li>
                })}
              </ul>
            </>
          ) : (
            <p style={dialogText}>This can&apos;t be undone. The files are removed from storage as well as the library.</p>
          )}
          <DialogButtons>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => { setDeleteConfirm(null); setSkippedInUse([]) }}>Cancel</button>
            <button type="button" className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => runDelete(deleteConfirm.ids, skippedInUse.length > 0)}>
              {skippedInUse.length > 0 ? 'Delete anyway' : 'Confirm delete'}
            </button>
          </DialogButtons>
        </Overlay>
      )}

      {collision && (
        <CollisionDialog
          name={collision.name}
          allowSkip={collision.kind === 'move'}
          onCancel={() => setCollision(null)}
          onChoose={(mode) => {
            if (collision.kind === 'rename') performRename(collision.id, collision.newName, mode === 'skip' ? 'suffix' : mode)
            else performMove(collision.ids, collision.targetFolderId, mode)
          }}
        />
      )}

      <MediaToasts toasts={allToasts} onDismiss={dismissToast} />
    </div>
  )
}

// --- shared styles ---
const inputStyle: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg-subtle)', position: 'sticky', top: '0.5rem', zIndex: 30 }

function EmptyState({ loading, search, canUpload }: { loading: boolean; search: string; canUpload: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '3.5rem 1rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <span style={{ fontSize: '2rem' }} aria-hidden>🗂️</span>
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', fontWeight: 500 }}>
        {loading ? 'Loading…' : search ? 'Nothing matches your search' : 'This folder is empty'}
      </span>
      {!loading && !search && canUpload && (
        <span style={{ fontSize: 'var(--text-sm)' }}>Drag files here, or use the Upload button.</span>
      )}
    </div>
  )
}

function isDescendant(folders: FolderNode[], ancestorId: string, maybeDescendantId: string | null): boolean {
  if (!maybeDescendantId) return false
  const byId = new Map(folders.map((f) => [f.id, f]))
  let id: string | null = maybeDescendantId
  let guard = 0
  while (id && guard++ < 50) {
    if (id === ancestorId) return true
    id = byId.get(id)?.parentId ?? null
  }
  return false
}

function trailFor(folderId: string | null, folders: FolderNode[]): FolderNode[] {
  if (!folderId) return []
  const byId = new Map(folders.map((f) => [f.id, f]))
  const trail: FolderNode[] = []
  let id: string | null = folderId
  let guard = 0
  while (id && guard++ < 50) {
    const f = byId.get(id)
    if (!f) break
    trail.unshift(f)
    id = f.parentId
  }
  return trail
}

function BreadcrumbCrumb({ label, onClick, onDrop, active }: { label: string; onClick: () => void; onDrop: (raw: string) => void; active: boolean }) {
  const [over, setOver] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/plain')) }}
      style={{ background: over ? 'var(--color-primary)' : 'transparent', color: over ? '#fff' : active ? 'var(--color-text)' : 'var(--color-text-muted)', border: 'none', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: 'inherit', fontFamily: 'inherit' }}
    >
      {label}
    </button>
  )
}

function ContextMenu({ menu, canUpload, canDelete, hasClipboard, canEdit, canOptimise, onOpen, onOptimise, onCut, onCopy, onPaste, onRename, onMove, onTags, onEdit, onDelete }: {
  menu: { x: number; y: number; id: string }
  canUpload: boolean; canDelete: boolean; hasClipboard: boolean; canEdit: boolean; canOptimise: boolean
  onOpen: () => void; onOptimise: () => void; onCut: () => void; onCopy: () => void; onPaste: () => void; onRename: () => void; onMove: () => void; onTags: () => void; onEdit: () => void; onDelete: () => void
}) {
  const item = (label: string, fn: () => void, danger = false, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); fn() }}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.75rem', border: 'none', background: 'transparent', color: disabled ? 'var(--color-text-muted)' : danger ? 'var(--color-destructive)' : 'var(--color-text)', cursor: disabled ? 'default' : 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}
    >
      {label}
    </button>
  )
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: Math.min(menu.y, window.innerHeight - 320), left: Math.min(menu.x, window.innerWidth - 200), zIndex: 100, width: 190, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', padding: '0.25rem 0', overflow: 'hidden' }}
    >
      {item('Open details', onOpen)}
      {canUpload && canOptimise && item('Optimise', onOptimise)}
      {canUpload && canEdit && item('Edit image…', onEdit)}
      {canUpload && item('Cut', onCut)}
      {canUpload && item('Copy', onCopy)}
      {canUpload && item('Paste here', onPaste, false, !hasClipboard)}
      {canUpload && item('Rename…', onRename)}
      {canUpload && item('Move to…', onMove)}
      {canUpload && item('Tags…', onTags)}
      {canDelete && item('Delete', onDelete, true)}
    </div>
  )
}

function NameDialog({ title, label, confirmLabel, initial = '', onCancel, onSubmit }: {
  title: string; label: string; confirmLabel: string; initial?: string; onCancel: () => void; onSubmit: (name: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Overlay onCancel={onCancel}>
      <h2 style={dialogTitle}>{title}</h2>
      <label style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{label}</label>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()) }} style={inputStyle} />
      <DialogButtons>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>{confirmLabel}</button>
      </DialogButtons>
    </Overlay>
  )
}

function DeleteFolderDialog({ folder, onCancel, onConfirm }: { folder: FolderNode; onCancel: () => void; onConfirm: () => void }) {
  const [summary, setSummary] = useState<{ folders: number; media: number; inUseNames: string[] } | null>(null)
  useEffect(() => {
    fetch(`/api/admin/media/folders/${folder.id}`).then((r) => r.json()).then((d) => setSummary(d)).catch(() => setSummary({ folders: 1, media: 0, inUseNames: [] }))
  }, [folder.id])
  return (
    <Overlay onCancel={onCancel}>
      <h2 style={dialogTitle}>Delete “{folder.name}” and everything in it?</h2>
      {summary ? (
        <>
          <p style={dialogText}>
            This permanently removes {summary.folders} folder{summary.folders === 1 ? '' : 's'} and {summary.media} file{summary.media === 1 ? '' : 's'}, including the files themselves. It can&apos;t be undone.
          </p>
          {summary.inUseNames.length > 0 && (
            <div style={{ fontSize: 'var(--text-sm)' }}>
              <strong style={{ color: 'var(--color-destructive)' }}>Some of these files are still in use on the site:</strong>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem', maxHeight: 140, overflow: 'auto' }}>
                {summary.inUseNames.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
        </>
      ) : <p style={dialogText}>Working out what&apos;s inside…</p>}
      <DialogButtons>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={onConfirm}>Delete everything</button>
      </DialogButtons>
    </Overlay>
  )
}

function MoveDialog({ folders, currentFolderId, onCancel, onSubmit }: { folders: FolderNode[]; currentFolderId: string | null; onCancel: () => void; onSubmit: (target: string | null) => void }) {
  const [target, setTarget] = useState<string | null>(null)
  const roots = folders.filter((f) => !f.parentId)
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id)
  const renderNode = (f: FolderNode, depth: number): React.ReactNode => (
    <div key={f.id}>
      <button type="button" onClick={() => setTarget(f.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.5rem', paddingLeft: `${0.5 + depth * 1}rem`, border: 'none', borderRadius: 'var(--radius-sm)', background: target === f.id ? 'var(--color-primary)' : 'transparent', color: target === f.id ? '#fff' : 'var(--color-text)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}>
        {f.name}
      </button>
      {childrenOf(f.id).map((c) => renderNode(c, depth + 1))}
    </div>
  )
  return (
    <Overlay onCancel={onCancel}>
      <h2 style={dialogTitle}>Move to folder</h2>
      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.25rem' }}>
        <button type="button" onClick={() => setTarget(null)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.5rem', border: 'none', borderRadius: 'var(--radius-sm)', background: target === null ? 'var(--color-primary)' : 'transparent', color: target === null ? '#fff' : 'var(--color-text)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}>
          Media (root)
        </button>
        {roots.map((f) => renderNode(f, 1))}
      </div>
      <DialogButtons>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={target === currentFolderId} onClick={() => onSubmit(target)}>Move here</button>
      </DialogButtons>
    </Overlay>
  )
}

function CollisionDialog({ name, allowSkip, onCancel, onChoose }: { name: string; allowSkip: boolean; onCancel: () => void; onChoose: (mode: 'suffix' | 'replace' | 'skip') => void }) {
  return (
    <Overlay onCancel={onCancel}>
      <h2 style={dialogTitle}>“{name}” already exists here</h2>
      <p style={dialogText}>There&apos;s already a file with that name in the destination folder. What would you like to do?</p>
      <DialogButtons>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        {allowSkip && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChoose('skip')}>Skip</button>}
        <button type="button" className="btn btn-danger btn-sm" onClick={() => onChoose('replace')}>Replace</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onChoose('suffix')}>Keep both</button>
      </DialogButtons>
    </Overlay>
  )
}

function Overlay({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div role="dialog" aria-modal="true" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(460px, 92vw)', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {children}
      </div>
    </div>
  )
}

function DialogButtons({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem', flexWrap: 'wrap' }}>{children}</div>
}

const dialogTitle: CSSProperties = { margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }
const dialogText: CSSProperties = { margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }
