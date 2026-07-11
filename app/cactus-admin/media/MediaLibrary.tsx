'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MediaCard, { type MediaCardItem } from './MediaCard'
import MediaLightbox from './MediaLightbox'
import MediaImageEditor from './MediaImageEditor'
import MediaUpload from './MediaUpload'
import FolderTree, { type FolderNode } from './FolderTree'
import { uploadOneFile } from '@/lib/media/upload-client'

export type LibraryItem = MediaCardItem & { folderId: string | null; tags: string[] }
export type TagInfo = { id: string; name: string; count: number }

type Sort = 'newest' | 'oldest' | 'name' | 'name_desc' | 'largest' | 'smallest'
type TypeFilter = 'all' | 'image' | 'other'
type UseFilter = 'all' | 'in-use' | 'unused'

type Clipboard = { mode: 'cut' | 'copy'; ids: string[] } | null

type Menu = { x: number; y: number; id: string } | null

type CollisionState =
  | { kind: 'rename'; id: string; newName: string; name: string }
  | { kind: 'move'; ids: string[]; targetFolderId: string | null; name: string }
  | null

const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'largest', label: 'Largest first' },
  { value: 'smallest', label: 'Smallest first' },
]

export default function MediaLibrary({
  initialItems,
  initialHasMore,
  folders: initialFolders,
  rootCount: initialRootCount,
  tags: initialTags,
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
  canUpload: boolean
  canDelete: boolean
  perPage: number
}) {
  const [folders, setFolders] = useState<FolderNode[]>(initialFolders)
  const [rootCount, setRootCount] = useState(initialRootCount)
  const [tags, setTags] = useState<TagInfo[]>(initialTags)

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
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

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastToggled, setLastToggled] = useState<number | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
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
  const [tagItem, setTagItem] = useState<LibraryItem | null>(null)
  const [editItem, setEditItem] = useState<LibraryItem | null>(null)
  const [collision, setCollision] = useState<CollisionState>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // A search or tag filter searches the whole tree; folder browsing scopes to one.
  const folderScope = search || tagFilter ? 'all' : currentFolderId ?? 'root'

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
    setError('')
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
      setError(err instanceof Error ? err.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  // Reload whenever the query changes. Skips the very first run — the server
  // already provided the root's first page as initialItems.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    fetchItems()
  }, [fetchItems])

  const refetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media/folders')
      const d = await res.json()
      if (res.ok) {
        setFolders(d.folders)
        setRootCount(d.rootCount)
      }
    } catch {
      /* leave the tree as-is on a transient error */
    }
  }, [])

  const refetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/media/tags')
      const d = await res.json()
      if (res.ok) setTags(d.tags)
    } catch {
      /* ignore */
    }
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
    } catch {
      /* sentinel retries on next scroll */
    } finally {
      setLoading(false)
    }
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
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

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

  const openIndex = openId ? items.findIndex((i) => i.id === openId) : -1
  const openItem = openIndex >= 0 ? items[openIndex] : null

  // --- drag and drop ---
  function onDragStart(e: React.DragEvent, id: string) {
    // Drag the whole selection if the grabbed card is part of it, else just it.
    const ids = selected.has(id) ? Array.from(selected) : [id]
    e.dataTransfer.setData('text/plain', ids.join(','))
    e.dataTransfer.effectAllowed = 'move'
  }

  async function onDropToFolder(targetFolderId: string | null, raw: string) {
    const ids = raw.split(',').filter(Boolean)
    if (ids.length === 0) return
    await performMove(ids, targetFolderId, 'error')
  }

  // --- mutations ---
  async function performMove(ids: string[], targetFolderId: string | null, mode: 'error' | 'suffix' | 'replace' | 'skip') {
    setBusy('Moving…')
    setError('')
    try {
      const res = await fetch('/api/admin/media/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, targetFolderId, collision: mode }),
      })
      const d = await res.json()
      if (res.status === 409 && d.collision) {
        setCollision({ kind: 'move', ids, targetFolderId, name: d.name })
        return
      }
      if (!res.ok) throw new Error(d.error ?? 'Move failed')
      setCollision(null)
      setSelected(new Set())
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
      // A mid-batch failure may have moved some items already; resync so the grid
      // reflects reality rather than showing a stale pre-move state.
      await Promise.all([fetchItems(), refetchFolders()])
    } finally {
      setBusy('')
    }
  }

  // Move a whole folder under another (or to root) via drag-and-drop. No-ops and
  // illegal drops (onto itself or one of its own descendants) are dropped before
  // hitting the API; the server guards these too.
  async function performMoveFolder(folderId: string, targetParentId: string | null) {
    const node = folders.find((f) => f.id === folderId)
    if (!node) return
    if (targetParentId === (node.parentId ?? null)) return
    if (targetParentId === folderId || isDescendant(folders, folderId, targetParentId)) {
      setError("A folder can't be moved inside itself")
      return
    }
    setBusy('Moving folder…')
    setError('')
    try {
      const res = await fetch(`/api/admin/media/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: targetParentId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Move failed')
      await Promise.all([refetchFolders(), fetchItems()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setBusy('')
    }
  }

  async function performRename(id: string, newName: string, mode: 'error' | 'suffix' | 'replace') {
    setBusy('Renaming…')
    setError('')
    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName, collision: mode }),
      })
      const d = await res.json()
      if (res.status === 409 && d.collision) {
        setCollision({ kind: 'rename', id, newName, name: d.name })
        return
      }
      if (!res.ok) throw new Error(d.error ?? 'Rename failed')
      setCollision(null)
      setRenameItem(null)
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setBusy('')
    }
  }

  async function paste(targetFolderId: string | null) {
    if (!clipboard) return
    setBusy(clipboard.mode === 'cut' ? 'Moving…' : 'Pasting…')
    setError('')
    try {
      if (clipboard.mode === 'cut') {
        await performMove(clipboard.ids, targetFolderId, 'error')
      } else {
        const res = await fetch('/api/admin/media/duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: clipboard.ids, targetFolderId }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Paste failed')
        await Promise.all([fetchItems(), refetchFolders()])
      }
      setClipboard(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paste failed')
      // Some copies/moves may have landed before the failure; resync the grid.
      await Promise.all([fetchItems(), refetchFolders()])
    } finally {
      setBusy('')
    }
  }

  // Delete flow mirrors the old grid: a first pass without force reports any
  // items still referenced elsewhere so the admin can reconsider before forcing.
  async function runDelete(ids: string[], force: boolean) {
    if (ids.length === 0) return
    setBusy('Deleting…')
    setError('')
    try {
      const res = await fetch('/api/admin/media/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, force }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Delete failed')
      if (d.skipped?.length > 0 && !force) {
        setSkippedInUse(d.skipped)
        setDeleteConfirm({ ids: d.skipped.map((s: { id: string }) => s.id) })
      } else {
        setDeleteConfirm(null)
        setSkippedInUse([])
        setSelected(new Set())
      }
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy('')
    }
  }

  async function optimiseSingle(id: string) {
    setOptimisingIds((prev) => new Set(prev).add(id))
    setError('')
    try {
      const res = await fetch(`/api/admin/media/${id}/optimise`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Optimise failed')
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimise failed')
    } finally {
      setOptimisingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  async function optimiseBulk() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBusy('Optimising…')
    setError('')
    try {
      const res = await fetch('/api/admin/media/bulk-optimise', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Optimise failed')
      setSelected(new Set())
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimise failed')
    } finally {
      setBusy('')
    }
  }

  // Upload files dropped straight onto the grid, or onto a folder row in the
  // sidebar, from the desktop. Same endpoint as the header's Upload button.
  // Defaults to the open folder; a sidebar drop passes the row's folder instead.
  async function uploadFiles(files: FileList, targetFolderId: string | null = currentFolderId) {
    const list = Array.from(files)
    if (list.length === 0) return
    setBusy('Uploading…')
    setError('')
    try {
      for (const file of list) {
        await uploadOneFile(file, targetFolderId)
      }
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      await Promise.all([fetchItems(), refetchFolders()])
    } finally {
      setBusy('')
    }
  }

  const currentTrail = useMemo(() => trailFor(currentFolderId, folders), [currentFolderId, folders])

  const clipboardIdSet = useMemo(() => new Set(clipboard?.mode === 'cut' ? clipboard.ids : []), [clipboard])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Media Library</h1>
        {canUpload && <MediaUpload folderId={currentFolderId} onUploaded={() => { fetchItems(); refetchFolders() }} />}
      </div>

      {error && <div style={{ marginBottom: '1rem', color: 'var(--color-destructive)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {busy && <div style={{ marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{busy}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <FolderTree
          folders={folders}
          rootCount={rootCount}
          currentFolderId={currentFolderId}
          canManage={canUpload}
          canDelete={canDelete}
          onNavigate={(id) => { setSearch(''); setSearchInput(''); setTagFilter(''); setCurrentFolderId(id) }}
          onDropItems={onDropToFolder}
          onDropFiles={(folderId, files) => uploadFiles(files, folderId)}
          onMoveFolder={performMoveFolder}
          onNewFolder={() => setNewFolderOpen(true)}
          onRenameFolder={(f) => setRenameFolderNode(f)}
          onDeleteFolder={(f) => setDeleteFolderNode(f)}
        />

        <div
          // minHeight makes the whole panel a file-drop target, not just the
          // rows the images happen to fill - so dropping into the empty space
          // below a short grid (or an empty folder) still uploads.
          style={{ position: 'relative', minHeight: '60vh' }}
          onDragOver={canUpload ? (e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setFileDragOver(true) }
          } : undefined}
          onDragLeave={canUpload ? (e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDragOver(false)
          } : undefined}
          onDrop={canUpload ? (e) => {
            if (e.dataTransfer.files.length > 0) { e.preventDefault(); setFileDragOver(false); uploadFiles(e.dataTransfer.files) }
            else setFileDragOver(false)
          } : undefined}
        >
          {fileDragOver && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--color-primary)', borderRadius: 'var(--radius)', background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: 'var(--text-base)', fontWeight: 600, pointerEvents: 'none' }}>
              Drop to upload{currentTrail.length > 0 ? ` to ${currentTrail[currentTrail.length - 1]?.name}` : ''}
            </div>
          )}
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: 'var(--text-sm)' }}>
            <BreadcrumbCrumb label="Media" onClick={() => setCurrentFolderId(null)} onDrop={(raw) => onDropToFolder(null, raw)} active={currentFolderId === null && !search && !tagFilter} />
            {currentTrail.map((f) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <BreadcrumbCrumb label={f.name} onClick={() => setCurrentFolderId(f.id)} onDrop={(raw) => onDropToFolder(f.id, raw)} active={f.id === currentFolderId} />
              </span>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
            <form
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()) }}
              style={{ flex: '1 1 220px', minWidth: 180 }}
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search all folders…"
                style={inputStyle}
              />
            </form>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={selectStyle} aria-label="Sort order">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)} style={selectStyle} aria-label="File type">
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="other">Other files</option>
            </select>
            <select value={use} onChange={(e) => setUse(e.target.value as UseFilter)} style={selectStyle} aria-label="Usage">
              <option value="all">All</option>
              <option value="in-use">In use</option>
              <option value="unused">Not in use</option>
            </select>
            {tags.length > 0 && (
              <select value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); if (e.target.value) { setSearch(''); setSearchInput('') } }} style={selectStyle} aria-label="Filter by tag">
                <option value="">All tags</option>
                {tags.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.count})</option>)}
              </select>
            )}
          </div>

          {/* Selection / clipboard bar */}
          {(selected.size > 0 || clipboard) && (
            <div style={barStyle}>
              {selected.size > 0 && <span style={{ fontSize: 'var(--text-sm)' }}>{selected.size} selected</span>}
              {selected.size > 0 && canUpload && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'cut', ids: Array.from(selected) })}>Cut</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'copy', ids: Array.from(selected) })}>Copy</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoveIds(Array.from(selected))}>Move to…</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={optimiseBulk}>Optimise</button>
                </>
              )}
              {selected.size > 0 && canDelete && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => { setSkippedInUse([]); setDeleteConfirm({ ids: Array.from(selected) }) }}>Delete</button>
              )}
              {clipboard && canUpload && (
                <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => paste(currentFolderId)}>
                  Paste {clipboard.ids.length} here ({clipboard.mode})
                </button>
              )}
              {(selected.size > 0 || clipboard) && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSelected(new Set()); setClipboard(null) }}>Clear</button>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>
              {loading ? 'Loading…' : search ? 'No media matches your search' : 'This folder is empty'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
              {items.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  canDelete={false}
                  canOptimise={canUpload}
                  optimising={optimisingIds.has(item.id)}
                  onOptimise={optimiseSingle}
                  selectable
                  selected={selected.has(item.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={setOpenId}
                  draggable={canUpload}
                  onDragStart={onDragStart}
                  onContextMenu={(e, id) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id }) }}
                  tags={item.tags}
                  dimmed={clipboardIdSet.has(item.id)}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div ref={sentinelRef} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              {loading ? 'Loading more…' : ''}
            </div>
          )}
        </div>
      </div>

      {openItem && (
        <MediaLightbox
          item={openItem}
          canManage={canUpload}
          canDelete={canDelete}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < items.length - 1}
          loadingNext={loading}
          onClose={() => setOpenId(null)}
          onPrev={() => { const p = items[openIndex - 1]; if (p) setOpenId(p.id) }}
          onNext={() => { const n = items[openIndex + 1]; if (n) setOpenId(n.id) }}
          onCut={() => { setClipboard({ mode: 'cut', ids: [openItem.id] }); setOpenId(null) }}
          onCopy={() => { setClipboard({ mode: 'copy', ids: [openItem.id] }); setOpenId(null) }}
          onRename={() => { setRenameItem(openItem); setOpenId(null) }}
          onMove={() => { setMoveIds([openItem.id]); setOpenId(null) }}
          onTags={() => { setTagItem(openItem); setOpenId(null) }}
          onEdit={() => { setEditItem(openItem); setOpenId(null) }}
        />
      )}

      {editItem && (
        <MediaImageEditor
          item={editItem}
          onCancel={() => setEditItem(null)}
          onSaved={(mode) => {
            setEditItem(null)
            setBusy(mode === 'new' ? 'Saved new image' : 'Replaced image')
            Promise.all([fetchItems(), refetchFolders()]).finally(() => setBusy(''))
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
          onCut={() => setClipboard({ mode: 'cut', ids: selected.has(menu.id) ? Array.from(selected) : [menu.id] })}
          onCopy={() => setClipboard({ mode: 'copy', ids: selected.has(menu.id) ? Array.from(selected) : [menu.id] })}
          onPaste={() => paste(currentFolderId)}
          onRename={() => { const it = items.find((i) => i.id === menu.id); if (it) setRenameItem(it) }}
          onMove={() => setMoveIds(selected.has(menu.id) ? Array.from(selected) : [menu.id])}
          onTags={() => { const it = items.find((i) => i.id === menu.id); if (it) setTagItem(it) }}
          onEdit={() => { const it = items.find((i) => i.id === menu.id); if (it) setEditItem(it) }}
          onDelete={() => { setSkippedInUse([]); setDeleteConfirm({ ids: selected.has(menu.id) ? Array.from(selected) : [menu.id] }) }}
        />
      )}

      {newFolderOpen && (
        <NameDialog
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          onCancel={() => setNewFolderOpen(false)}
          onSubmit={async (name) => {
            setBusy('Creating folder…')
            try {
              const res = await fetch('/api/admin/media/folders', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, parentId: currentFolderId }),
              })
              const d = await res.json()
              if (!res.ok) throw new Error(d.error ?? 'Could not create folder')
              setNewFolderOpen(false)
              await refetchFolders()
            } catch (err) { setError(err instanceof Error ? err.message : 'Could not create folder') }
            finally { setBusy('') }
          }}
        />
      )}

      {renameFolderNode && (
        <NameDialog
          title="Rename folder"
          label="Folder name"
          confirmLabel="Rename"
          initial={renameFolderNode.name}
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
            } catch (err) { setError(err instanceof Error ? err.message : 'Rename failed') }
            finally { setBusy('') }
          }}
        />
      )}

      {renameItem && (
        <NameDialog
          title="Rename file"
          label="Filename"
          confirmLabel="Rename"
          initial={renameItem.originalName ?? ''}
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
            } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed') }
            finally { setBusy('') }
          }}
        />
      )}

      {moveIds && (
        <MoveDialog
          folders={folders}
          currentFolderId={currentFolderId}
          onCancel={() => setMoveIds(null)}
          onSubmit={(target) => { const ids = moveIds; setMoveIds(null); performMove(ids, target, 'error') }}
        />
      )}

      {tagItem && (
        <TagDialog
          item={tagItem}
          allTags={tags}
          onCancel={() => setTagItem(null)}
          onSubmit={async (names) => {
            setBusy('Saving tags…')
            try {
              const res = await fetch(`/api/admin/media/${tagItem.id}/tags`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: names }),
              })
              const d = await res.json()
              if (!res.ok) throw new Error(d.error ?? 'Could not save tags')
              setTagItem(null)
              await Promise.all([fetchItems(), refetchTags()])
            } catch (err) { setError(err instanceof Error ? err.message : 'Could not save tags') }
            finally { setBusy('') }
          }}
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
    </div>
  )
}

// --- shared styles ---
const inputStyle: React.CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const selectStyle: React.CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const barStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg-subtle)' }

// Is `maybeDescendantId` the ancestor folder itself, or nested somewhere beneath
// it? Used to reject dragging a folder into its own subtree.
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
      style={{ background: over ? 'var(--color-primary)' : 'transparent', color: over ? 'var(--color-primary-contrast, #fff)' : active ? 'var(--color-text)' : 'var(--color-text-muted)', border: 'none', padding: '0.15rem 0.4rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: 'inherit', fontFamily: 'inherit' }}
    >
      {label}
    </button>
  )
}

function ContextMenu({ menu, canUpload, canDelete, hasClipboard, canEdit, onCut, onCopy, onPaste, onRename, onMove, onTags, onEdit, onDelete }: {
  menu: { x: number; y: number; id: string }
  canUpload: boolean; canDelete: boolean; hasClipboard: boolean; canEdit: boolean
  onCut: () => void; onCopy: () => void; onPaste: () => void; onRename: () => void; onMove: () => void; onTags: () => void; onEdit: () => void; onDelete: () => void
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
      style={{ position: 'fixed', top: Math.min(menu.y, window.innerHeight - 300), left: Math.min(menu.x, window.innerWidth - 200), zIndex: 100, width: 190, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', padding: '0.25rem 0', overflow: 'hidden' }}
    >
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
      <button type="button" onClick={() => setTarget(f.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.5rem', paddingLeft: `${0.5 + depth * 1}rem`, border: 'none', borderRadius: 'var(--radius-sm)', background: target === f.id ? 'var(--color-primary)' : 'transparent', color: target === f.id ? 'var(--color-primary-contrast, #fff)' : 'var(--color-text)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}>
        {f.name}
      </button>
      {childrenOf(f.id).map((c) => renderNode(c, depth + 1))}
    </div>
  )
  return (
    <Overlay onCancel={onCancel}>
      <h2 style={dialogTitle}>Move to folder</h2>
      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '0.25rem' }}>
        <button type="button" onClick={() => setTarget(null)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.3rem 0.5rem', border: 'none', borderRadius: 'var(--radius-sm)', background: target === null ? 'var(--color-primary)' : 'transparent', color: target === null ? 'var(--color-primary-contrast, #fff)' : 'var(--color-text)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}>
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

function TagDialog({ item, allTags, onCancel, onSubmit }: { item: LibraryItem; allTags: TagInfo[]; onCancel: () => void; onSubmit: (names: string[]) => void }) {
  const [names, setNames] = useState<string[]>(item.tags)
  const [input, setInput] = useState('')
  const suggestions = allTags.map((t) => t.name).filter((n) => !names.includes(n) && n.toLowerCase().includes(input.toLowerCase()) && input.trim())
  function add(name: string) { const n = name.trim(); if (n && !names.includes(n)) setNames([...names, n]); setInput('') }
  return (
    <Overlay onCancel={onCancel}>
      <h2 style={dialogTitle}>Tags</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {names.map((n) => (
          <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--text-sm)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)' }}>
            {n}
            <button type="button" onClick={() => setNames(names.filter((x) => x !== n))} aria-label={`Remove ${n}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(input) } }} placeholder="Type a tag and press Enter…" style={inputStyle} />
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} style={{ fontSize: 'var(--text-sm)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)', background: 'transparent', border: '1px dashed var(--color-border)', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' }}>+ {s}</button>
          ))}
        </div>
      )}
      <DialogButtons>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onSubmit(names)}>Save</button>
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

const dialogTitle: React.CSSProperties = { margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }
const dialogText: React.CSSProperties = { margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }
