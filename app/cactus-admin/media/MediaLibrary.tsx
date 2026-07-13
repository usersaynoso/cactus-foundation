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
import MediaUploadQueue, { type UploadTask } from './MediaUploadQueue'
import FolderTree, { type FolderNode } from './FolderTree'
import { useFocusTrap } from './useFocusTrap'
import { uploadOneFile } from '@/lib/media/upload-client'
import { preflightUploadError } from '@/lib/media/limits'
import { formatBytes } from './format'
import type { MediaCardItem } from './MediaCard'
import type { LibraryItem, TagInfo, Sort, TypeFilter, UseFilter, ViewMode } from './types'

type Clipboard = { mode: 'cut' | 'copy'; ids: string[] } | null
// A context menu over a specific item (id set) or over empty grid space (id null).
type Menu = { x: number; y: number; id: string | null } | null

// True when an image can still be optimised: raster, not SVG, not already done.
function isOptimisable(item: { mimeType: string; optimised: boolean }): boolean {
  return item.mimeType.startsWith('image/') && item.mimeType !== 'image/svg+xml' && !item.optimised
}
type CollisionState =
  | { kind: 'rename'; id: string; newName: string; name: string }
  | { kind: 'move'; ids: string[]; targetFolderId: string | null; name: string }
  | null

const VIEW_KEY = 'cactus.media.view'
const SORT_KEY = 'cactus.media.sort'
const SORT_VALUES: Sort[] = ['newest', 'oldest', 'name', 'name_desc', 'largest', 'smallest']

export default function MediaLibrary({
  initialItems,
  initialHasMore,
  initialTotal,
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
  const [total, setTotal] = useState(initialTotal)
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
  const [savingMeta, setSavingMeta] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [uploads, setUploads] = useState<UploadTask[]>([])
  const uploadSeq = useRef(0)
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
  // Hidden file input driven by the empty-state and whitespace-menu "upload" actions.
  const whitespaceUploadRef = useRef<HTMLInputElement>(null)

  // Restore the saved grid/list preference once, on the client. Must run in an
  // effect, not a lazy initializer: reading localStorage during render would
  // diverge from the server's default and trip a hydration mismatch.
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydrate of a persisted UI pref; safe one-shot re-render
    if (saved === 'grid' || saved === 'list') setView(saved)
  }, [])
  useEffect(() => { window.localStorage.setItem(VIEW_KEY, view) }, [view])

  // Restore the saved sort preference once, on the client - same one-shot hydrate
  // as the view mode. The subsequent fetch effect picks up the change.
  useEffect(() => {
    const saved = window.localStorage.getItem(SORT_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydrate of a persisted UI pref; safe one-shot re-render
    if (saved && (SORT_VALUES as string[]).includes(saved)) setSort(saved as Sort)
  }, [])
  useEffect(() => { window.localStorage.setItem(SORT_KEY, sort) }, [sort])

  // Live search: commit the typed query after a short pause so results filter as
  // you type. Enter still commits instantly via the toolbar's submit handler.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === search) return
    const t = setTimeout(() => {
      setSearch(trimmed)
      if (trimmed) setTagFilter('')
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput, search])

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
      setTotal(d.total ?? d.items.length)
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

  async function loadMore(): Promise<LibraryItem[]> {
    if (loading || !hasMore) return []
    setLoading(true)
    try {
      const next = page + 1
      const res = await fetch(`/api/admin/media?${buildQuery(next)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to load more')
      setItems((prev) => [...prev, ...d.items])
      setPage(next)
      setHasMore(d.hasMore)
      setTotal(d.total ?? total)
      return d.items as LibraryItem[]
    } catch { return [] /* sentinel retries on next scroll */ } finally { setLoading(false) }
  }

  // Advance the detail panel to the next item, paging in another batch when the
  // current one runs out - so Next never dead-ends while more items exist.
  async function openNext() {
    if (openIndex < 0) return
    const n = items[openIndex + 1]
    if (n) { setOpenId(n.id); return }
    if (!hasMore) return
    const loaded = await loadMore()
    const first = loaded[0]
    if (first) setOpenId(first.id)
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

  // Library-wide keyboard shortcuts. Suppressed while typing or while any dialog,
  // menu or the detail panel is open (each of those owns its own keys).
  useEffect(() => {
    const anyOverlayOpen = !!(openId || editItem || renameItem || renameFolderNode || deleteFolderNode || moveIds || newFolderOpen || deleteConfirm || collision || menu)
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (anyOverlayOpen) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'a' && items.length > 0) {
        e.preventDefault(); setSelected(new Set(items.map((i) => i.id)))
      } else if (mod && e.key.toLowerCase() === 'x' && canUpload && selected.size > 0) {
        e.preventDefault(); setClipboard({ mode: 'cut', ids: Array.from(selected) })
      } else if (mod && e.key.toLowerCase() === 'c' && canUpload && selected.size > 0) {
        e.preventDefault(); setClipboard({ mode: 'copy', ids: Array.from(selected) })
      } else if (mod && e.key.toLowerCase() === 'v' && clipboard && canUpload) {
        e.preventDefault(); paste(currentFolderId)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && canDelete && selected.size > 0) {
        e.preventDefault(); setSkippedInUse([]); setDeleteConfirm({ ids: Array.from(selected) })
      } else if (e.key === 'Escape' && (selected.size > 0 || clipboard)) {
        setSelected(new Set()); setClipboard(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paste closes over current state; re-bind on the inputs that gate the shortcuts
  }, [items, selected, clipboard, canUpload, canDelete, currentFolderId, openId, editItem, renameItem, renameFolderNode, deleteFolderNode, moveIds, newFolderOpen, deleteConfirm, collision, menu])

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

  // Safety net for the internal-drag flag. If a card unmounts mid-drag - e.g. a
  // move triggers a refetch that re-renders the grid before the card's own
  // onDragEnd fires - the flag could stick "on", which would then make onDragOver
  // bail and silently block every subsequent file drop. A window-level reset on
  // any drag end or drop guarantees it clears.
  useEffect(() => {
    const reset = () => { draggingInternal.current = false }
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    return () => { window.removeEventListener('dragend', reset); window.removeEventListener('drop', reset) }
  }, [])
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
      // The server won't touch an already-optimised (or already-tiny) image and
      // reports that back - reflect the real outcome instead of always claiming success.
      if (d.optimised) {
        const saved = typeof d.before === 'number' && typeof d.after === 'number' ? d.before - d.after : 0
        pushToast('success', saved > 0 ? `Optimised - saved ${formatBytes(saved)}` : 'Image optimised')
      } else {
        pushToast('info', d.reason === 'Already optimised' ? 'Already optimised - nothing to do' : d.reason ?? 'Nothing to optimise')
      }
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Optimise failed') }
    finally { setOptimisingIds((prev) => { const n = new Set(prev); n.delete(id); return n }) }
  }

  async function optimiseBulk() {
    // Only send the ones that can actually be optimised - the rest would just be
    // skipped server-side and muddy the result.
    const ids = items.filter((i) => selected.has(i.id) && isOptimisable(i)).map((i) => i.id)
    if (ids.length === 0) { pushToast('info', 'Nothing selected can be optimised'); return }
    setBusy('Optimising…')
    try {
      const res = await fetch('/api/admin/media/bulk-optimise', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Optimise failed')
      setSelected(new Set())
      const n = d.optimised?.length ?? 0
      const saved = typeof d.bytesSaved === 'number' ? d.bytesSaved : 0
      const extra = d.failed?.length ? `, ${d.failed.length} failed` : ''
      if (n > 0) pushToast('success', `Optimised ${n} item${n === 1 ? '' : 's'}${saved > 0 ? ` - saved ${formatBytes(saved)}` : ''}${extra}`)
      else pushToast('info', `Nothing to optimise${extra}`)
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Optimise failed') } finally { setBusy('') }
  }

  // Copy an item's public URL to the clipboard - the quickest way to reuse an
  // image in a link, an email, or content elsewhere.
  async function copyLink(item: MediaCardItem) {
    const url = item.url.startsWith('http') ? item.url : `${window.location.origin}${item.url}`
    try {
      await navigator.clipboard.writeText(url)
      pushToast('success', 'Link copied')
    } catch { pushToast('error', 'Could not copy link') }
  }

  // Trigger a browser download of the original file. The download attribute is a
  // hint only for cross-origin storage, but the file still opens/saves either way.
  function downloadItem(item: MediaCardItem) {
    const a = document.createElement('a')
    a.href = item.url
    a.download = item.originalName || item.key.split('/').pop() || 'download'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Copy several items' public URLs at once, newline-separated - handy for
  // pasting a batch into content or a spreadsheet.
  async function copyManyLinks(ids: string[]) {
    const urls = items
      .filter((i) => ids.includes(i.id))
      .map((i) => (i.url.startsWith('http') ? i.url : `${window.location.origin}${i.url}`))
    if (urls.length === 0) return
    try {
      await navigator.clipboard.writeText(urls.join('\n'))
      pushToast('success', `Copied ${urls.length} link${urls.length === 1 ? '' : 's'}`)
    } catch { pushToast('error', 'Could not copy links') }
  }

  async function saveMeta(item: LibraryItem, altText: string, isDecorative: boolean) {
    setSavingMeta(true)
    try {
      const res = await fetch(`/api/admin/media/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ altText, isDecorative }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not save alt text')
      pushToast('success', 'Alt text saved')
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Could not save alt text') } finally { setSavingMeta(false) }
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

  const updateTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setUploads((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])
  const clearFinishedUploads = useCallback(() => {
    setUploads((prev) => prev.filter((t) => t.status === 'queued' || t.status === 'uploading'))
  }, [])
  const dismissUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Upload files picked from the header button, dropped onto the grid, or dropped
  // onto a folder row. Each file becomes a task in the upload queue with its own
  // live progress bar, so the batch is visible rather than a silent spinner.
  // Invalid files (wrong type / too big) are flagged instantly without a request.
  async function enqueueFiles(files: FileList | File[], targetFolderId: string | null = currentFolderId) {
    const list = Array.from(files)
    if (list.length === 0) return
    const destination = folderName(targetFolderId)

    const tasks = list.map((file) => {
      const reason = preflightUploadError(file)
      const id = `u${++uploadSeq.current}`
      return {
        file,
        task: {
          id, name: file.name, size: file.size, destination,
          status: reason ? ('error' as const) : ('queued' as const),
          progress: 0,
          error: reason ?? undefined,
        } satisfies UploadTask,
      }
    })
    setUploads((prev) => [...prev, ...tasks.map((t) => t.task)])

    let uploaded = 0
    for (const { file, task } of tasks) {
      if (task.status === 'error') continue
      updateTask(task.id, { status: 'uploading', progress: 0 })
      try {
        await uploadOneFile(file, targetFolderId, (fraction) => updateTask(task.id, { progress: fraction }))
        updateTask(task.id, { status: 'done', progress: 1 })
        uploaded++
      } catch (err) {
        updateTask(task.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
      }
    }

    if (uploaded > 0) await Promise.all([fetchItems(), refetchFolders()])
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
  const optimisableSelected = useMemo(() => items.some((i) => selected.has(i.id) && isOptimisable(i)), [items, selected])
  const anyFilterActive = !!search || type !== 'all' || use !== 'all' || !!tagFilter
  const countLabel = items.length === 0 ? '' : items.length < total ? `Showing ${items.length} of ${total.toLocaleString('en-GB')}` : `${total.toLocaleString('en-GB')} item${total === 1 ? '' : 's'}`

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Media library</h1>
        {canUpload && <MediaUpload destinationLabel={folderName(currentFolderId)} onFiles={(files) => enqueueFiles(files)} />}
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
          onDropFiles={(folderId, files) => enqueueFiles(files, folderId)}
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
            // Skip internal card drags (those target folder rows). For anything
            // dragged in from outside, preventDefault enables the drop. Gating
            // only on the internal flag keeps this working in Safari, which
            // doesn't expose dataTransfer.types during dragover.
            if (draggingInternal.current) return
            e.preventDefault(); setFileDragOver(true)
          } : undefined}
          onDragLeave={canUpload ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDragOver(false) } : undefined}
          onDrop={canUpload ? (e) => {
            setFileDragOver(false)
            if (e.dataTransfer.files.length > 0) { e.preventDefault(); enqueueFiles(e.dataTransfer.files) }
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
              {selectionActive && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyManyLinks(Array.from(selected))}>Copy links</button>
              )}
              {selectionActive && canUpload && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'cut', ids: Array.from(selected) })}>Cut</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'copy', ids: Array.from(selected) })}>Copy</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoveIds(Array.from(selected))}>Move to…</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy || !optimisableSelected} title={optimisableSelected ? 'Optimise selected images' : 'Nothing selected can be optimised'} onClick={optimiseBulk}>Optimise</button>
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

          {/* Result count - orients you within a filtered or paged view. */}
          {countLabel && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: '0.6rem' }} aria-live="polite">{countLabel}</div>
          )}

          {/* Right-clicking empty space (not a card) opens a menu with paste/new
              folder/upload - so you can paste without needing an image to aim at. */}
          <div style={{ position: 'relative', minHeight: '45vh' }} onContextMenu={canUpload ? (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: null }) } : undefined}>
          {/* A dim veil while a filter/sort/folder change is in flight, so a slow
              query reads as loading rather than frozen. */}
          {loading && items.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '2rem', background: 'var(--color-overlay)', borderRadius: 'var(--radius)', pointerEvents: 'none' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '0.3rem 0.9rem', boxShadow: 'var(--shadow-md)' }}>Loading…</span>
            </div>
          )}
          {items.length === 0 ? (
            <EmptyState loading={loading} search={search} hasFilters={anyFilterActive} canUpload={canUpload} onChoose={() => whitespaceUploadRef.current?.click()} onClearFilters={clearAllFilters} />
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
                  onContextMenu={(e, id) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, id }) }}
                  onOptimise={canUpload ? optimiseSingle : undefined}
                  onCopyLink={copyLink}
                  optimisable={isOptimisable(item)}
                  optimising={optimisingIds.has(item.id)}
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
              onContextMenu={(e, id) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, id }) }}
              draggable={canUpload}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              sort={sort}
              onSort={setSort}
              folderName={folderName}
              clipboardIdSet={clipboardIdSet}
            />
          )}
          </div>

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
          hasNext={openIndex >= 0 && (openIndex < items.length - 1 || hasMore)}
          loadingNext={loading}
          allTags={tags}
          folderName={folderName}
          savingTags={savingTags}
          savingMeta={savingMeta}
          optimising={optimisingIds.has(openItem.id)}
          onClose={() => setOpenId(null)}
          onPrev={() => { const p = items[openIndex - 1]; if (p) setOpenId(p.id) }}
          onNext={openNext}
          onEdit={() => { setEditItem(openItem); setOpenId(null) }}
          onRename={() => setRenameItem(openItem)}
          onMove={() => setMoveIds([openItem.id])}
          onCut={() => { setClipboard({ mode: 'cut', ids: [openItem.id] }); setOpenId(null) }}
          onCopy={() => { setClipboard({ mode: 'copy', ids: [openItem.id] }); setOpenId(null) }}
          onDelete={() => { setSkippedInUse([]); setDeleteConfirm({ ids: [openItem.id] }) }}
          onOptimise={() => optimiseSingle(openItem.id)}
          onCopyLink={() => copyLink(openItem)}
          onDownload={() => downloadItem(openItem)}
          onSaveTags={(names) => saveTags(openItem, names)}
          onSaveMeta={(altText, isDecorative) => saveMeta(openItem, altText, isDecorative)}
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

      {menu && menu.id !== null && (() => {
        const id = menu.id
        const it = items.find((i) => i.id === id)
        return (
          <ContextMenu
            menu={{ x: menu.x, y: menu.y }}
            canUpload={canUpload}
            canDelete={canDelete}
            hasClipboard={!!clipboard}
            canEdit={!!it && it.mimeType.startsWith('image/') && it.mimeType !== 'image/svg+xml'}
            canOptimise={!!it && isOptimisable(it)}
            onOpen={() => setOpenId(id)}
            onOptimise={() => optimiseSingle(id)}
            onCopyLink={() => { if (it) copyLink(it) }}
            onDownload={() => { if (it) downloadItem(it) }}
            onCut={() => setClipboard({ mode: 'cut', ids: selected.has(id) ? Array.from(selected) : [id] })}
            onCopy={() => setClipboard({ mode: 'copy', ids: selected.has(id) ? Array.from(selected) : [id] })}
            onPaste={() => paste(currentFolderId)}
            onRename={() => { if (it) setRenameItem(it) }}
            onMove={() => setMoveIds(selected.has(id) ? Array.from(selected) : [id])}
            onTags={() => setOpenId(id)}
            onEdit={() => { if (it) setEditItem(it) }}
            onDelete={() => { setSkippedInUse([]); setDeleteConfirm({ ids: selected.has(id) ? Array.from(selected) : [id] }) }}
          />
        )
      })()}

      {menu && menu.id === null && (
        <WhitespaceMenu
          menu={{ x: menu.x, y: menu.y }}
          hasClipboard={!!clipboard}
          clipboardCount={clipboard?.ids.length ?? 0}
          hasItems={items.length > 0}
          onUpload={() => whitespaceUploadRef.current?.click()}
          onNewFolder={() => setNewFolderOpen(true)}
          onPaste={() => paste(currentFolderId)}
          onSelectAll={() => setSelected(new Set(items.map((i) => i.id)))}
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
      <MediaUploadQueue tasks={uploads} onClear={clearFinishedUploads} onDismiss={dismissUpload} />

      {/* Off-screen input backing the empty-state and whitespace-menu upload actions. */}
      {canUpload && (
        <input
          ref={whitespaceUploadRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files && e.target.files.length > 0) enqueueFiles(e.target.files); e.target.value = '' }}
        />
      )}
    </div>
  )
}

// --- shared styles ---
const inputStyle: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg-subtle)', position: 'sticky', top: '0.5rem', zIndex: 30 }

function EmptyState({ loading, search, hasFilters, canUpload, onChoose, onClearFilters }: { loading: boolean; search: string; hasFilters: boolean; canUpload: boolean; onChoose: () => void; onClearFilters: () => void }) {
  const filteredEmpty = !loading && hasFilters
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '3.5rem 1rem', border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)' }}>
      <span style={{ fontSize: '2.25rem' }} aria-hidden>{filteredEmpty ? '🔍' : '🗂️'}</span>
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', fontWeight: 500 }}>
        {loading ? 'Loading…' : filteredEmpty ? (search ? 'Nothing matches your search' : 'Nothing matches these filters') : 'This folder is empty'}
      </span>
      {filteredEmpty && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClearFilters}>Clear filters</button>
      )}
      {!loading && !hasFilters && canUpload && (
        <>
          <span style={{ fontSize: 'var(--text-sm)' }}>Drag images anywhere here to upload them.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onChoose}>Choose files…</button>
        </>
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

function MenuShell({ menu, children, width = 190, height = 360 }: { menu: { x: number; y: number }; children: React.ReactNode; width?: number; height?: number }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: Math.min(menu.y, window.innerHeight - height), left: Math.min(menu.x, window.innerWidth - width - 10), zIndex: 100, width, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', padding: '0.25rem 0', overflow: 'hidden' }}
    >
      {children}
    </div>
  )
}

function menuItem(label: string, fn: () => void, danger = false, disabled = false) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); fn() }}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.75rem', border: 'none', background: 'transparent', color: disabled ? 'var(--color-text-muted)' : danger ? 'var(--color-destructive)' : 'var(--color-text)', cursor: disabled ? 'default' : 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}
    >
      {label}
    </button>
  )
}

function ContextMenu({ menu, canUpload, canDelete, hasClipboard, canEdit, canOptimise, onOpen, onOptimise, onCopyLink, onDownload, onCut, onCopy, onPaste, onRename, onMove, onTags, onEdit, onDelete }: {
  menu: { x: number; y: number }
  canUpload: boolean; canDelete: boolean; hasClipboard: boolean; canEdit: boolean; canOptimise: boolean
  onOpen: () => void; onOptimise: () => void; onCopyLink: () => void; onDownload: () => void; onCut: () => void; onCopy: () => void; onPaste: () => void; onRename: () => void; onMove: () => void; onTags: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <MenuShell menu={menu}>
      {menuItem('Open details', onOpen)}
      {menuItem('Copy link', onCopyLink)}
      {menuItem('Download', onDownload)}
      {canUpload && canOptimise && menuItem('Optimise', onOptimise)}
      {canUpload && canEdit && menuItem('Edit image…', onEdit)}
      {canUpload && menuItem('Cut', onCut)}
      {canUpload && menuItem('Copy', onCopy)}
      {canUpload && menuItem('Paste here', onPaste, false, !hasClipboard)}
      {canUpload && menuItem('Rename…', onRename)}
      {canUpload && menuItem('Move to…', onMove)}
      {canUpload && menuItem('Tags…', onTags)}
      {canDelete && menuItem('Delete', onDelete, true)}
    </MenuShell>
  )
}

// The menu you get from right-clicking empty grid space - so paste, new folder
// and upload don't require an image to aim at.
function WhitespaceMenu({ menu, hasClipboard, clipboardCount, hasItems, onUpload, onNewFolder, onPaste, onSelectAll }: {
  menu: { x: number; y: number }
  hasClipboard: boolean; clipboardCount: number; hasItems: boolean
  onUpload: () => void; onNewFolder: () => void; onPaste: () => void; onSelectAll: () => void
}) {
  return (
    <MenuShell menu={menu} height={180}>
      {menuItem(hasClipboard ? `Paste ${clipboardCount} here` : 'Paste here', onPaste, false, !hasClipboard)}
      {menuItem('Upload files…', onUpload)}
      {menuItem('New folder…', onNewFolder)}
      {menuItem('Select all', onSelectAll, false, !hasItems)}
    </MenuShell>
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
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  // Escape closes any dialog, matching the detail panel and context menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div role="dialog" aria-modal="true" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-xl)', maxWidth: 'min(460px, 92vw)', width: '100%', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
