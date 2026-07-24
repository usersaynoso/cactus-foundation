'use client'

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MediaCard from './MediaCard'
import MediaList from './MediaList'
import MediaDetailPanel from './MediaDetailPanel'
import MediaImageEditor from './MediaImageEditor'
import MediaAspectDialog, { type AspectOutcome } from './MediaAspectDialog'
import MediaResizeDialog, { type ResizeOutcome } from './MediaResizeDialog'
import MediaUpload from './MediaUpload'
import MediaStatsBar, { type LibraryStats } from './MediaStatsBar'
import MediaToolbar from './MediaToolbar'
import MediaToasts, { type Toast, type ToastKind } from './MediaToasts'
import { type UploadTask, addUploads, updateUpload } from '@/lib/upload-status-client'
import FolderTree, { type FolderNode } from './FolderTree'
import { useFocusTrap } from './useFocusTrap'
import { uploadOneFile, replaceOneFile, isFileReadable, UNREADABLE_FILE_MESSAGE } from '@/lib/media/upload-client'
import { type UploadChoice, planUploadJobs, runUploadPool } from '@/lib/media/upload-batch'
import { preflightUploadError, isAcceptedUploadType, isOptimisableType, UPLOAD_ACCEPT_ATTR, IMAGE_ACCEPT_ATTR } from '@/lib/media/limits'
import { formatBytes, filenameOf } from './format'
import { runBulkImageJob } from './bulkImageJob'
import type { MediaCardItem } from './MediaCard'
import type { LibraryItem, TagInfo, Sort, TypeFilter, UseFilter, ViewMode } from './types'

type Clipboard = { mode: 'cut' | 'copy'; ids: string[] } | null
// A context menu over a specific item (id set) or over empty grid space (id null).
type Menu = { x: number; y: number; id: string | null } | null

// True when a file can still be optimised: something the optimiser handles (a
// raster image or a GLB model), and not already done. The type half of that
// question lives in lib/media/limits.ts, which the server guard and the
// "Optimisable" tile's SQL both read too - so the button offered here and the
// answer the server gives cannot drift apart.
function isOptimisable(item: { mimeType: string; optimised: boolean }): boolean {
  return isOptimisableType(item.mimeType) && !item.optimised
}

// True when an item has actual pixels to work on - SVG is vector, so there's
// nothing to pad or scale, and non-images obviously have neither a ratio nor a
// size in pixels. Shared by the reshape and resize actions, which want the same
// answer for the same reason.
function isRasterImage(item: { mimeType: string }): boolean {
  return item.mimeType.startsWith('image/') && item.mimeType !== 'image/svg+xml'
}

// True when an item's file can be swapped for a fresh one. Gated on what the
// library itself accepts, which keeps Replace off the rows it can't produce a
// sane replacement for: a module's 3D model records its own rows here, and the
// file picker only offers images, so the only "replacement" on offer for a model
// would be one that breaks it.
function isReplaceable(item: { mimeType: string }): boolean {
  return isAcceptedUploadType(item.mimeType)
}
type CollisionState =
  | { kind: 'rename'; id: string; newName: string; name: string }
  | { kind: 'move'; ids: string[]; targetFolderId: string | null; name: string }
  | null

/**
 * Which of `names` already exist in the destination folder. A failed lookup
 * returns an empty map rather than throwing: the upload should still go ahead,
 * just without the prompt - but the caller is told (`checkFailed`), so it can
 * say so out loud instead of silently uploading over the top.
 */
async function lookUpNameClashes(
  names: string[],
  folderId: string | null,
): Promise<{ clashes: Map<string, { name: string; suggestedName: string; existingId: string }>; checkFailed: boolean }> {
  const map = new Map<string, { name: string; suggestedName: string; existingId: string }>()
  if (names.length === 0) return { clashes: map, checkFailed: false }
  try {
    const res = await fetch('/api/admin/media/name-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId, names }),
    })
    if (!res.ok) return { clashes: map, checkFailed: true }
    const d = await res.json()
    for (const c of d.clashes ?? []) map.set(c.name, c)
  } catch {
    // No prompt is better than no upload - but not silently.
    return { clashes: map, checkFailed: true }
  }
  return { clashes: map, checkFailed: false }
}

/** The same bytes under a different filename, so the new name reaches the key. */
function renameFile(file: File, name: string): File {
  return new File([file], name, { type: file.type, lastModified: file.lastModified })
}

// UploadChoice - what the person chose when told an upload's name was already
// taken - lives in lib/media/upload-batch.ts with the rest of the batch logic.

// An upload paused mid-batch on "that name is already here". `resolve` is the
// waiting enqueueFiles loop, resumed by whichever button is pressed - so the
// answer arrives before any bytes are sent, and nothing is renamed or
// overwritten without being asked for.
type UploadClash = {
  name: string
  suggestedName: string
  existingId: string
  // How many clashes are still unanswered, this one included. Drives the "do the
  // same for the rest" offer, which only makes sense when there's more than one.
  remaining: number
  resolve: (choice: UploadChoice, applyToAll: boolean) => void
}

const VIEW_KEY = 'cactus.media.view'
const SORT_KEY = 'cactus.media.sort'
const SORT_VALUES: Sort[] = ['newest', 'oldest', 'name', 'name_desc', 'largest', 'smallest']
// Batch size for bulk delete/move once "Select all" can hand over hundreds of
// ids in one go - each item is a storage round trip server-side, so a big
// selection needs splitting into several short requests rather than one long one.
const DELETE_BATCH = 40
const MOVE_BATCH = 40

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
  // Not part of the File type dropdown: this is the "Optimisable" stat tile's own
  // drill-down, showing exactly the images that tile counted rather than every
  // image in the library.
  const [optimisableOnly, setOptimisableOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  // A search reads the folder you are standing in, the way a file manager's does.
  // Whole-library search is still a click away - it just isn't the default any
  // more, because "search inside this folder" used to be impossible to ask for.
  const [searchEverywhere, setSearchEverywhere] = useState(false)
  const [view, setView] = useState<ViewMode>('grid')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Items that are selected but not on screen - what "Select all" pulls in from
  // the pages nobody has scrolled to yet. The bulk actions need the rows, not
  // just the ids (a ratio change wants the image, "Optimise" wants the mime type),
  // and those rows aren't in `items` because the grid never loaded them.
  const [extraSelected, setExtraSelected] = useState<Map<string, LibraryItem>>(new Map())
  const [lastToggled, setLastToggled] = useState<number | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const [busy, setBusy] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [fileDragOver, setFileDragOver] = useState(false)
  const uploadSeq = useRef(0)
  // Upload batches run strictly one after another. Two live at once was broken
  // twice over: a second drop's clash dialog overwrote the first batch's pending
  // one (uploadClash is a single state slot, so the first batch's resolve was
  // never called and its files sat "queued" forever), and two upload pools meant
  // six requests in flight - exactly the Safari connection ceiling the 3-wide
  // pool exists to stay under.
  const uploadBatchChain = useRef<Promise<void>>(Promise.resolve())
  const [optimisingIds, setOptimisingIds] = useState<Set<string>>(new Set())
  const [replacingIds, setReplacingIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null)
  const [skippedInUse, setSkippedInUse] = useState<{ id: string; references: string[] }[]>([])

  // Dialogs
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renameItem, setRenameItem] = useState<LibraryItem | null>(null)
  const [renameFolderNode, setRenameFolderNode] = useState<FolderNode | null>(null)
  const [deleteFolderNode, setDeleteFolderNode] = useState<FolderNode | null>(null)
  const [moveIds, setMoveIds] = useState<string[] | null>(null)
  const [editItem, setEditItem] = useState<LibraryItem | null>(null)
  // The images the ratio dialog is currently aimed at - one from the panel or
  // context menu, many from the selection bar. Null when the dialog is closed.
  const [aspectItems, setAspectItems] = useState<LibraryItem[] | null>(null)
  // Same again for the resize dialog, which is aimed the same three ways.
  const [resizeItems, setResizeItems] = useState<LibraryItem[] | null>(null)
  const [collision, setCollision] = useState<CollisionState>(null)
  const [uploadClash, setUploadClash] = useState<UploadClash | null>(null)

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
  // And its counterpart for Replace, plus the item the next pick is aimed at. A
  // ref, not state: the picker is opened and read within one user gesture, so
  // nothing needs to re-render because a target was chosen.
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetId = useRef<string | null>(null)

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

  // A tag filter or stat-tile drill-down spans the whole tree. A search stays in
  // the folder you are standing in unless you ask for the whole library, and
  // "this folder" means its direct contents - not its sub-folders - so the result
  // set matches what browsing that folder shows you.
  const folderScope =
    tagFilter || browseAll || (search && searchEverywhere) ? 'all' : currentFolderId ?? 'root'
  /** True when the view is showing the whole tree rather than one folder. */
  const viewingAllFolders = folderScope === 'all'


  const buildQuery = useCallback(
    (pageNum: number) => {
      const qs = new URLSearchParams({ page: String(pageNum), perPage: String(perPage), sort })
      qs.set('folder', folderScope)
      if (type !== 'all') qs.set('type', type)
      if (use !== 'all') qs.set('filter', use)
      if (optimisableOnly) qs.set('optimisable', '1')
      if (tagFilter) qs.set('tag', tagFilter)
      if (search) qs.set('q', search)
      return qs.toString()
    },
    [perPage, sort, folderScope, type, use, optimisableOnly, tagFilter, search],
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
      setExtraSelected(new Map())
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
    const anyOverlayOpen = !!(openId || editItem || aspectItems || resizeItems || renameItem || renameFolderNode || deleteFolderNode || moveIds || newFolderOpen || deleteConfirm || collision || uploadClash || menu)
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
        setSelected(new Set()); setExtraSelected(new Map()); setClipboard(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paste closes over current state; re-bind on the inputs that gate the shortcuts
  }, [items, selected, clipboard, canUpload, canDelete, currentFolderId, openId, editItem, aspectItems, resizeItems, renameItem, renameFolderNode, deleteFolderNode, moveIds, newFolderOpen, deleteConfirm, collision, uploadClash, menu])

  // --- navigation ---
  const navigateFolder = useCallback((id: string | null) => {
    setSearch(''); setSearchInput(''); setSearchEverywhere(false); setTagFilter(''); setBrowseAll(false); setCurrentFolderId(id)
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
  function clearSelection() {
    setSelected(new Set())
    setExtraSelected(new Map())
    setLastToggled(null)
  }

  // Select everything the current view matches, not just the pages that have been
  // scrolled into view. The server hands back the rows as well as the ids, so the
  // bulk actions can judge what they're allowed to do to items nobody has seen.
  async function selectAllMatching() {
    setBusy('Selecting…')
    try {
      const res = await fetch(`/api/admin/media/select-all?${buildQuery(1)}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not select everything')
      const all = (d.items ?? []) as LibraryItem[]
      if (all.length === 0) { pushToast('info', 'Nothing here to select'); return }
      setExtraSelected(new Map(all.map((i) => [i.id, i])))
      setSelected(new Set(all.map((i) => i.id)))
      setLastToggled(null)
      if (d.truncated) {
        pushToast('info', `Selected the first ${all.length.toLocaleString('en-GB')} of ${Number(d.total ?? all.length).toLocaleString('en-GB')} - that is as many as one go handles`)
      }
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not select everything')
    } finally { setBusy('') }
  }

  // Every selected row, on screen or not, in the order the grid shows them. The
  // bulk actions read this rather than `items`, or a selection made with "Select
  // all" would silently shrink to the 25 cards that happen to be rendered.
  const selectedItems = useMemo<LibraryItem[]>(() => {
    if (selected.size === 0) return []
    const shown = items.filter((i) => selected.has(i.id))
    const seen = new Set(shown.map((i) => i.id))
    const offscreen: LibraryItem[] = []
    for (const id of selected) {
      if (seen.has(id)) continue
      const extra = extraSelected.get(id)
      if (extra) offscreen.push(extra)
    }
    return [...shown, ...offscreen]
  }, [items, selected, extraSelected])

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
  // Batched the same way as delete: a "Select all" selection can be hundreds of
  // ids, and the route resolves each one's target path in turn server-side, so
  // one giant request risks the same time-limit cliff. A collision anywhere
  // stops the whole run there - the batches after it are never sent - so the
  // prompt lines up with what has and hasn't moved yet.
  async function performMove(ids: string[], targetFolderId: string | null, mode: 'error' | 'suffix' | 'replace' | 'skip') {
    const label = (done: number) => (ids.length <= MOVE_BATCH ? 'Moving…' : `Moving ${done}/${ids.length}…`)
    setBusy(label(0))
    let movedCount = 0
    try {
      for (let i = 0; i < ids.length; i += MOVE_BATCH) {
        const batch = ids.slice(i, i + MOVE_BATCH)
        const res = await fetch('/api/admin/media/move', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: batch, targetFolderId, collision: mode }),
        })
        const d = await res.json()
        if (res.status === 409 && d.collision) {
          // Items after this one in the batch, and every later batch, never went.
          const remaining = [...batch.slice(batch.indexOf(d.id)), ...ids.slice(i + batch.length)]
          setCollision({ kind: 'move', ids: remaining, targetFolderId, name: d.name })
          return
        }
        if (!res.ok) throw new Error(d.error ?? 'Move failed')
        movedCount += Array.isArray(d.moved) ? d.moved.length : batch.length
        setBusy(label(Math.min(i + batch.length, ids.length)))
      }
      setCollision(null)
      clearSelection()
      pushToast('success', `Moved ${movedCount} item${movedCount === 1 ? '' : 's'}`)
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
  //
  // Sent in batches, because each item means a storage delete and a row delete
  // done one after another server-side: a whole-folder selection handed over in
  // one request would run past the request time limit and report nothing at all
  // for work it had actually done. Batching keeps every request short and lets
  // the count tick along while it goes.
  async function runDelete(ids: string[], force: boolean) {
    if (ids.length === 0) return
    const label = (done: number) => (ids.length <= DELETE_BATCH ? 'Deleting…' : `Deleting ${done}/${ids.length}…`)
    setBusy(label(0))
    const deleted: string[] = []
    const skipped: { id: string; references: string[] }[] = []
    try {
      for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        const batch = ids.slice(i, i + DELETE_BATCH)
        const res = await fetch('/api/admin/media/bulk-delete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: batch, force }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'Delete failed')
        if (Array.isArray(d.deleted)) deleted.push(...d.deleted)
        if (Array.isArray(d.skipped)) skipped.push(...d.skipped)
        setBusy(label(Math.min(i + batch.length, ids.length)))
      }
      if (skipped.length > 0 && !force) {
        setSkippedInUse(skipped)
        setDeleteConfirm({ ids: skipped.map((s) => s.id) })
      } else {
        setDeleteConfirm(null); setSkippedInUse([]); clearSelection()
        if (openId && ids.includes(openId)) setOpenId(null)
        pushToast('success', `Deleted ${deleted.length} item${deleted.length === 1 ? '' : 's'}`)
      }
      await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Delete failed')
      // A run that stops half way through has still deleted whatever the earlier
      // batches got through, so the grid has to be refreshed either way.
      await Promise.all([fetchItems(), refetchFolders()])
    } finally { setBusy('') }
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
    const ids = selectedItems.filter((i) => isOptimisable(i)).map((i) => i.id)
    if (ids.length === 0) { pushToast('info', 'Nothing selected can be optimised'); return }
    // Counted out loud as it goes: re-encoding a few hundred images is a long
    // wait, and a spinner that says nothing for all of it looks like a hang.
    const label = (done: number) => (ids.length === 1 ? 'Optimising…' : `Optimising ${done}/${ids.length}…`)
    setBusy(label(0))
    try {
      const tally = await runBulkImageJob('/api/admin/media/bulk-optimise', ids, {}, {
        changedKey: 'optimised',
        onProgress: (done) => setBusy(label(done)),
      })
      clearSelection()
      const n = tally.changed.length
      const saved = tally.bytesSaved
      const extra = tally.failed.length > 0 ? `, ${tally.failed.length} failed` : ''
      if (n > 0) pushToast('success', `Optimised ${n} item${n === 1 ? '' : 's'}${saved > 0 ? ` - saved ${formatBytes(saved)}` : ''}${extra}`)
      else pushToast('info', `Nothing to optimise${extra}`)
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Optimise failed') } finally { setBusy('') }
  }

  // Say a file is already optimised without re-encoding it - for images that were
  // compressed before they were ever uploaded, where the optimiser's offer is
  // just a slow way of being told what you already knew. Reversible, so a wrong
  // call isn't a one-way door: the same action puts an item back on the list.
  async function markOptimised(ids: string[], optimised: boolean) {
    if (ids.length === 0) { pushToast('info', 'Nothing selected can be marked'); return }
    setBusy(optimised ? 'Marking…' : 'Unmarking…')
    try {
      const res = await fetch('/api/admin/media/bulk-mark-optimised', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, optimised }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not mark those items')
      const n = Array.isArray(d.changed) ? d.changed.length : 0
      const noun = `${n} item${n === 1 ? '' : 's'}`
      if (n > 0) pushToast('success', optimised ? `Marked ${noun} as optimised` : `${noun} back on the optimise list`)
      else pushToast('info', 'Nothing to mark')
      await fetchItems()
    } catch (err) { pushToast('error', err instanceof Error ? err.message : 'Could not mark those items') } finally { setBusy('') }
  }

  // Open the file picker for a replacement. Which item it's aimed at rides on a
  // ref through the browser's own dialog and comes back in the input's change.
  function chooseReplacement(id: string) {
    replaceTargetId.current = id
    replaceInputRef.current?.click()
  }

  // Swap one item's file for a freshly picked one. The item survives - same id,
  // name, folder, alt text, tags - so every page and product pointing at it keeps
  // working and just shows the new picture. That's the whole reason this exists
  // rather than "upload the new one, delete the old one".
  //
  // Goes through the upload queue like any other upload, so a big file replacing
  // an image shows a live progress bar in the bell rather than a silent spinner.
  async function replaceItem(id: string, file: File) {
    const target = items.find((i) => i.id === id)
    const reason = preflightUploadError(file)
    const taskId = `u${++uploadSeq.current}`
    addUploads([{
      id: taskId,
      name: file.name,
      size: file.size,
      destination: folderName(target?.folderId ?? null),
      status: reason ? 'error' : 'uploading',
      progress: 0,
      error: reason ?? undefined,
    }])
    if (reason) { pushToast('error', reason); return }

    setReplacingIds((prev) => new Set(prev).add(id))
    try {
      await replaceOneFile(id, file, (fraction) => updateUpload(taskId, { progress: fraction }))
      updateUpload(taskId, { status: 'done', progress: 1 })
      pushToast('success', target ? `Replaced ${filenameOf(target)}` : 'File replaced')
      await fetchItems()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Replace failed'
      updateUpload(taskId, { status: 'error', error: msg })
      pushToast('error', msg)
    } finally {
      setReplacingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  // Report a ratio change the way the user experienced it: how many actually
  // changed shape, and why any were left alone (already that shape, or a JPEG
  // asked for transparency). Skips aren't failures, so they read as info.
  async function onAspectDone(outcome: AspectOutcome) {
    setAspectItems(null)
    const { changed, skipped, failed, mode } = outcome
    const extra = failed > 0 ? `, ${failed} failed` : ''
    if (changed > 0) {
      const noun = `${changed} image${changed === 1 ? '' : 's'}`
      const skippedNote = skipped.length > 0 ? `, ${skipped.length} left alone` : ''
      pushToast('success', mode === 'new' ? `Saved ${noun} at the new ratio${skippedNote}${extra}` : `Reshaped ${noun}${skippedNote}${extra}`)
    } else if (skipped.length > 0) {
      // One skip gets its actual reason; several would just be a wall of text.
      const only = skipped.length === 1 ? skipped[0]?.reason : undefined
      pushToast('info', only ?? `Nothing to change - ${skipped.length} images already that shape${extra}`)
    } else {
      pushToast(failed > 0 ? 'error' : 'info', failed > 0 ? `Ratio change failed for ${failed} image${failed === 1 ? '' : 's'}` : 'Nothing to change')
    }
    if (changed > 0) {
      clearSelection()
      await Promise.all([fetchItems(), refetchFolders()])
    }
  }

  // Report a resize the way the user experienced it, as onAspectDone does for
  // reshaping: how many actually shrank, how much that saved, and why any were
  // left alone (already smaller than the box). Skips aren't failures.
  async function onResizeDone(outcome: ResizeOutcome) {
    setResizeItems(null)
    const { changed, skipped, failed, mode, bytesSaved } = outcome
    const extra = failed > 0 ? `, ${failed} failed` : ''
    if (changed > 0) {
      const noun = `${changed} image${changed === 1 ? '' : 's'}`
      const skippedNote = skipped.length > 0 ? `, ${skipped.length} left alone` : ''
      const savedNote = bytesSaved > 0 ? ` - ${formatBytes(bytesSaved)} smaller` : ''
      pushToast('success', `${mode === 'new' ? `Saved ${noun} at the new size` : `Resized ${noun}`}${savedNote}${skippedNote}${extra}`)
    } else if (skipped.length > 0) {
      // One skip gets its actual reason; several would just be a wall of text.
      const only = skipped.length === 1 ? skipped[0]?.reason : undefined
      pushToast('info', only ?? `Nothing to resize - ${skipped.length} images already fit${extra}`)
    } else {
      pushToast(failed > 0 ? 'error' : 'info', failed > 0 ? `Resize failed for ${failed} image${failed === 1 ? '' : 's'}` : 'Nothing to resize')
    }
    if (changed > 0) {
      clearSelection()
      await Promise.all([fetchItems(), refetchFolders()])
    }
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
  async function copyManyLinks(sources: LibraryItem[]) {
    const urls = sources.map((i) => (i.url.startsWith('http') ? i.url : `${window.location.origin}${i.url}`))
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
    addUploads(tasks.map((t) => t.task))

    // Read-access guard (see isFileReadable in upload-client). Safari hands a web
    // page read access to only a prefix of a very large multi-file selection - a
    // 26k-file pick came back with the first few hundred readable and the rest
    // refused outright, which used to fail deep in the upload path as a status-0
    // "bad URL" with no hint why. Probe every file that cleared the type/size
    // preflight, a wave at a time so a huge selection doesn't open tens of
    // thousands of readers at once, and settle the unreadable tail here with a
    // reason instead of letting it upload, retry three times and die on the wire.
    const toProbe = tasks.filter((t) => t.task.status !== 'error')
    const unreadable = new Set<string>()
    const PROBE_WIDTH = 24
    for (let i = 0; i < toProbe.length; i += PROBE_WIDTH) {
      await Promise.all(toProbe.slice(i, i + PROBE_WIDTH).map(async (t) => {
        if (!(await isFileReadable(t.file))) {
          unreadable.add(t.task.id)
          updateUpload(t.task.id, { status: 'error', error: UNREADABLE_FILE_MESSAGE })
        }
      }))
    }
    if (unreadable.size > 0) {
      const readable = toProbe.length - unreadable.size
      pushToast('error', `Your browser could only read ${readable} of ${toProbe.length} files. Safari limits how many a page may open at once, so upload the rest in smaller batches - or use Chrome or Edge for very large uploads.`)
    }
    // Only the files the browser will actually read reach the uploader; the rest
    // are already settled as errors above.
    const runnable = tasks.filter((t) => !unreadable.has(t.task.id) && t.task.status !== 'error')
    if (runnable.length === 0) return

    // Tasks appear in the queue immediately, but the batch itself waits its turn
    // behind any batch already running (see uploadBatchChain).
    const turn = uploadBatchChain.current.then(() => runUploadBatch(runnable, targetFolderId))
    // A failed batch must not wedge every batch after it.
    uploadBatchChain.current = turn.catch(() => {})
    try {
      await turn
    } catch (err) {
      // Callers fire-and-forget this function, so a rejection here would vanish
      // into an unhandled-promise warning nobody sees. runUploadBatch already
      // marked its own tasks; this is the last-resort announcement.
      pushToast('error', `Upload batch stopped: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  async function runUploadBatch(
    tasks: { file: File; task: UploadTask }[],
    targetFolderId: string | null,
  ) {
    // Whatever happens below, every task must end in a terminal state. A task
    // left "queued" forever is the worst failure mode this path has had: a
    // stalled bar with no message, nothing to report, nothing to copy. Track
    // what has settled so the catch-all can name the rest.
    const settled = new Set<string>()
    const settle = (taskId: string, patch: Partial<UploadTask>) => {
      settled.add(taskId)
      updateUpload(taskId, patch)
    }
    for (const t of tasks) if (t.task.status === 'error') settled.add(t.task.id)

    try {
      // Ask the server which of these names are already taken in the destination
      // before anything is sent. A name that is free uploads straight through; a
      // name that isn't stops and asks, because the alternatives - overwrite, or
      // quietly file it as something else - are both things only the person
      // uploading can choose between.
      const live = tasks.filter((t) => t.task.status !== 'error')
      const { clashes, checkFailed } = await lookUpNameClashes(live.map((t) => t.file.name), targetFolderId)
      if (checkFailed) {
        // The upload still goes ahead - clashing names get a "-2" suffix from the
        // server rather than overwriting - but say so, because the person was
        // expecting a prompt and needs to know why it never came.
        pushToast('error', 'Could not check for existing file names, so nothing will be overwritten - any name that is already taken will upload under a numbered name instead.')
      }

      // Phase 1: every clash answered before anything is sent (see
      // lib/media/upload-batch.ts for why). The dialog is the `ask` callback;
      // pressing a button resolves it and the loop moves to the next clash.
      const jobs = await planUploadJobs(
        tasks.map((t) => ({ file: t.file, taskId: t.task.id, name: t.file.name, blocked: t.task.status === 'error' })),
        clashes,
        (clash, remaining) => new Promise((resolve) => {
          setUploadClash({ ...clash, remaining, resolve: (c, all) => { setUploadClash(null); resolve({ choice: c, applyToAll: all }) } })
        }),
        (taskId) => settle(taskId, { status: 'skipped' }),
      )

      // Phase 2: three uploads in flight at once, not six. Every job needs two
      // connections - the signing call to this origin, then the byte PUT to the
      // media host - and a six-wide pool would sit on the browser's ~6-per-host
      // ceiling with nothing left for the thumbnails and API calls the page makes
      // alongside. Three keeps a lane spare without leaving five idle the way a
      // serial loop did, which is what made a few hundred small files take all
      // afternoon. (The "bulk uploads fail en masse" bug was a separate thing
      // entirely - Safari refusing to read the tail of a huge selection - and is
      // caught up front in enqueueFiles now, not here.)
      const CONCURRENT_UPLOADS = 3
      const uploaded = await runUploadPool(
        jobs,
        CONCURRENT_UPLOADS,
        async (job) => {
          if (job.clash && job.choice === 'replace') {
            // The existing item keeps its row, its url and everything pointing at
            // it - only the bytes change. That is what "replace" has to mean here,
            // or the pages already using the file would be left on the old one.
            await replaceOneFile(job.clash.existingId, job.file, (fraction) => updateUpload(job.taskId, { progress: fraction }))
          } else {
            // "Keep both": the file goes up under the free name the server offered,
            // which carries into the storage key and so into the public url too.
            const named = job.clash ? renameFile(job.file, job.clash.suggestedName) : job.file
            await uploadOneFile(named, targetFolderId, (fraction) => updateUpload(job.taskId, { progress: fraction }))
          }
        },
        {
          start: (taskId) => updateUpload(taskId, { status: 'uploading', progress: 0 }),
          done: (taskId) => settle(taskId, { status: 'done', progress: 1 }),
          fail: (taskId, message) => settle(taskId, { status: 'error', error: message }),
        },
      )

      if (uploaded > 0) await Promise.all([fetchItems(), refetchFolders()])
    } catch (err) {
      // Something outside a single upload broke (the refresh after the batch,
      // or a bug in the batch plumbing itself). Name it on every task it
      // stranded, so the failure reads as what it is rather than a bar stuck at
      // nought forever.
      const message = `The batch stopped unexpectedly: ${err instanceof Error ? err.message : 'unknown error'}`
      for (const t of tasks) {
        if (!settled.has(t.task.id)) settle(t.task.id, { status: 'error', error: message })
      }
      throw err
    }
  }

  const currentTrail = useMemo(() => trailFor(currentFolderId, folders), [currentFolderId, folders])
  const clipboardIdSet = useMemo(() => new Set(clipboard?.mode === 'cut' ? clipboard.ids : []), [clipboard])
  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders])
  const folderName = useCallback((id: string | null) => (id ? folderNameById.get(id) ?? '—' : 'Media'), [folderNameById])

  const activeFilter: 'all' | 'unused' | 'optimisable' | 'other' =
    optimisableOnly ? 'optimisable'
    : use === 'unused' ? 'unused'
    : browseAll && type === 'all' && use === 'all' && !tagFilter && !search ? 'all'
    : 'other'

  function clearAllFilters() {
    setSearch(''); setSearchInput(''); setSearchEverywhere(false); setTagFilter(''); setType('all'); setUse('all'); setOptimisableOnly(false)
  }

  const selectionActive = selected.size > 0
  const optimisableSelected = useMemo(() => selectedItems.some((i) => isOptimisable(i)), [selectedItems])
  const rasterSelected = useMemo(() => selectedItems.filter((i) => isRasterImage(i)), [selectedItems])
  // Which way the "already optimised" button points, and at what. Anything still
  // unmarked gets marked; a selection where everything is marked already offers
  // the way back instead, so the flag is never a door that only opens one way.
  const markTargets = useMemo(() => {
    const eligible = selectedItems.filter((i) => isOptimisableType(i.mimeType))
    const unmarked = eligible.filter((i) => !i.optimised)
    return unmarked.length > 0
      ? { optimised: true, ids: unmarked.map((i) => i.id) }
      : { optimised: false, ids: eligible.map((i) => i.id) }
  }, [selectedItems])
  const anyFilterActive = !!search || type !== 'all' || use !== 'all' || optimisableOnly || !!tagFilter
  const countLabel = items.length === 0 ? '' : items.length < total ? `Showing ${items.length} of ${total.toLocaleString('en-GB')}` : `${total.toLocaleString('en-GB')} item${total === 1 ? '' : 's'}`

  return (
    // The whole page is a drop target, not just the grid panel. A file let go over
    // the header, the stats bar or the gap beside the folder tree used to do
    // nothing at all - no upload, no message - which reads as "this page won't take
    // my file" rather than "you missed". The panel keeps its own handlers for the
    // "Drop to upload" overlay; these are the safety net around it.
    <div
      onDragOver={canUpload ? (e) => {
        if (draggingInternal.current) return
        e.preventDefault()
        setFileDragOver(true)
      } : undefined}
      onDragLeave={canUpload ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileDragOver(false) } : undefined}
      onDrop={canUpload ? (e) => {
        // A drop the grid panel or a folder row already took has had
        // preventDefault called on it on the way up - uploading it again here
        // would file every dropped model twice.
        if (draggingInternal.current || e.defaultPrevented) return
        if (e.dataTransfer.files.length > 0) { e.preventDefault(); setFileDragOver(false); enqueueFiles(e.dataTransfer.files) }
      } : undefined}
    >
      <div className="page-header">
        <h1 className="page-title">Media library</h1>
        {canUpload && <MediaUpload destinationLabel={folderName(currentFolderId)} onFiles={(files) => enqueueFiles(files)} />}
      </div>

      <MediaStatsBar
        stats={stats}
        folderCount={folders.length}
        activeFilter={activeFilter}
        onShowAll={() => { clearAllFilters(); setBrowseAll(true); setCurrentFolderId(null) }}
        onShowUnused={() => { setSearch(''); setSearchInput(''); setTagFilter(''); setType('all'); setUse('unused'); setOptimisableOnly(false); setBrowseAll(true) }}
        onShowOptimisable={() => { setSearch(''); setSearchInput(''); setTagFilter(''); setUse('all'); setType('all'); setOptimisableOnly(true); setBrowseAll(true) }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <FolderTree
          folders={folders}
          rootCount={rootCount}
          currentFolderId={currentFolderId}
          browsingAll={viewingAllFolders}
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
              Drop to upload{currentTrail.length > 0 && !viewingAllFolders ? ` to ${currentTrail[currentTrail.length - 1]?.name}` : ''}
            </div>
          )}

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: 'var(--text-sm)' }}>
            <BreadcrumbCrumb label="Media" onClick={() => navigateFolder(null)} onDrop={(raw) => onDropToFolder(null, raw)} active={currentFolderId === null && !viewingAllFolders} />
            {!viewingAllFolders && currentTrail.map((f) => (
              <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>/</span>
                <BreadcrumbCrumb label={f.name} onClick={() => navigateFolder(f.id)} onDrop={(raw) => onDropToFolder(f.id, raw)} active={f.id === currentFolderId} />
              </span>
            ))}
            {viewingAllFolders && (
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
            optimisableOnly={optimisableOnly}
            onOptimisableOnly={setOptimisableOnly}
            tagFilter={tagFilter}
            onTagFilter={(v) => { setTagFilter(v); if (v) { setSearch(''); setSearchInput('') } }}
            tags={tags}
            view={view}
            onView={setView}
            activeSearch={search}
            searchEverywhere={searchEverywhere}
            onSearchEverywhere={setSearchEverywhere}
            searchFolderLabel={folderName(currentFolderId)}
            onClearAll={clearAllFilters}
          />

          {/* Selection / clipboard bar */}
          {(selectionActive || clipboard) && (
            <div style={barStyle}>
              {selectionActive && <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{selected.size.toLocaleString('en-GB')} selected</span>}
              {/* The grid only holds the pages you have scrolled to, so ticking
                  every card still leaves the rest of the folder untouched. This
                  reaches the lot - everything the current filters match, seen or
                  not - which is what people mean by "select all". */}
              {selectionActive && selected.size < total && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!!busy}
                  title={`Select all ${total.toLocaleString('en-GB')} items this view matches, including the ones not loaded yet`}
                  onClick={selectAllMatching}
                >
                  Select all {total.toLocaleString('en-GB')}
                </button>
              )}
              {selectionActive && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => copyManyLinks(selectedItems)}>Copy links</button>
              )}
              {selectionActive && canUpload && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'cut', ids: Array.from(selected) })}>Cut</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setClipboard({ mode: 'copy', ids: Array.from(selected) })}>Copy</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoveIds(Array.from(selected))}>Move to…</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy || !optimisableSelected} title={optimisableSelected ? 'Optimise selected images' : 'Nothing selected can be optimised'} onClick={optimiseBulk}>Optimise</button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!!busy || markTargets.ids.length === 0}
                    title={markTargets.ids.length === 0
                      ? 'Nothing selected can be marked'
                      : markTargets.optimised
                        ? 'Already optimised these yourself? Say so and the library stops offering to re-encode them. The files are not touched.'
                        : 'Put these back on the optimise list. The files are not touched.'}
                    onClick={() => markOptimised(markTargets.ids, markTargets.optimised)}
                  >
                    {markTargets.optimised ? 'Mark as optimised' : 'Mark as not optimised'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!!busy || rasterSelected.length === 0}
                    title={rasterSelected.length > 0 ? 'Change the aspect ratio of the selected images' : 'Nothing selected can be reshaped'}
                    onClick={() => setAspectItems(rasterSelected)}
                  >
                    Change ratio…
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!!busy || rasterSelected.length === 0}
                    title={rasterSelected.length > 0 ? 'Resize the selected images' : 'Nothing selected can be resized'}
                    onClick={() => setResizeItems(rasterSelected)}
                  >
                    Resize…
                  </button>
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
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => { clearSelection(); setClipboard(null) }}>Clear</button>
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
            <EmptyState
              loading={loading}
              search={search}
              hasFilters={anyFilterActive}
              canUpload={canUpload}
              scopedSearchIn={search && !viewingAllFolders ? folderName(currentFolderId) : null}
              onChoose={() => whitespaceUploadRef.current?.click()}
              onClearFilters={clearAllFilters}
              onSearchEverywhere={() => setSearchEverywhere(true)}
            />
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
                  onReplace={canUpload ? chooseReplacement : undefined}
                  onCopyLink={copyLink}
                  optimisable={isOptimisable(item)}
                  optimising={optimisingIds.has(item.id)}
                  replaceable={isReplaceable(item)}
                  replacing={replacingIds.has(item.id)}
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
          replacing={replacingIds.has(openItem.id)}
          replaceable={isReplaceable(openItem)}
          onClose={() => setOpenId(null)}
          onPrev={() => { const p = items[openIndex - 1]; if (p) setOpenId(p.id) }}
          onNext={openNext}
          onEdit={() => { setEditItem(openItem); setOpenId(null) }}
          onChangeRatio={() => { setAspectItems([openItem]); setOpenId(null) }}
          onResize={() => { setResizeItems([openItem]); setOpenId(null) }}
          onRename={() => setRenameItem(openItem)}
          onMove={() => setMoveIds([openItem.id])}
          onCut={() => { setClipboard({ mode: 'cut', ids: [openItem.id] }); setOpenId(null) }}
          onCopy={() => { setClipboard({ mode: 'copy', ids: [openItem.id] }); setOpenId(null) }}
          onDelete={() => { setSkippedInUse([]); setDeleteConfirm({ ids: [openItem.id] }) }}
          onOptimise={() => optimiseSingle(openItem.id)}
          onMarkOptimised={() => markOptimised([openItem.id], !openItem.optimised)}
          onReplace={() => chooseReplacement(openItem.id)}
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

      {aspectItems && aspectItems.length > 0 && (
        <MediaAspectDialog
          items={aspectItems}
          onCancel={() => setAspectItems(null)}
          onDone={onAspectDone}
          onError={(msg) => pushToast('error', msg)}
        />
      )}

      {resizeItems && resizeItems.length > 0 && (
        <MediaResizeDialog
          items={resizeItems}
          onCancel={() => setResizeItems(null)}
          onDone={onResizeDone}
          onError={(msg) => pushToast('error', msg)}
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
            canMarkOptimised={!!it && isOptimisableType(it.mimeType)}
            markedOptimised={!!it?.optimised}
            canReplace={!!it && isReplaceable(it)}
            onOpen={() => setOpenId(id)}
            onOptimise={() => optimiseSingle(id)}
            onMarkOptimised={() => {
              // Right-clicking inside a selection acts on the whole selection, as
              // Cut/Copy/Move already do here - but only on the items the claim
              // can be made about, and only in the direction this one implies.
              const target = selected.has(id)
                ? items.filter((i) => selected.has(i.id) && isOptimisableType(i.mimeType) && i.optimised === !!it?.optimised)
                : (it ? [it] : [])
              markOptimised(target.map((i) => i.id), !it?.optimised)
            }}
            onReplace={() => chooseReplacement(id)}
            onCopyLink={() => { if (it) copyLink(it) }}
            onDownload={() => { if (it) downloadItem(it) }}
            onCut={() => setClipboard({ mode: 'cut', ids: selected.has(id) ? Array.from(selected) : [id] })}
            onCopy={() => setClipboard({ mode: 'copy', ids: selected.has(id) ? Array.from(selected) : [id] })}
            onPaste={() => paste(currentFolderId)}
            onRename={() => { if (it) setRenameItem(it) }}
            onMove={() => setMoveIds(selected.has(id) ? Array.from(selected) : [id])}
            onTags={() => setOpenId(id)}
            onEdit={() => { if (it) setEditItem(it) }}
            onChangeRatio={() => {
              // Right-clicking inside a selection acts on the whole selection,
              // matching how Cut/Copy/Move already behave here.
              const target = selected.has(id) ? rasterSelected : (it && isRasterImage(it) ? [it] : [])
              if (target.length > 0) setAspectItems(target)
            }}
            onResize={() => {
              const target = selected.has(id) ? rasterSelected : (it && isRasterImage(it) ? [it] : [])
              if (target.length > 0) setResizeItems(target)
            }}
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

      {uploadClash && (
        <UploadClashDialog
          name={uploadClash.name}
          suggestedName={uploadClash.suggestedName}
          remaining={uploadClash.remaining}
          onChoose={uploadClash.resolve}
        />
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

      {/* Off-screen input backing the empty-state and whitespace-menu upload actions.
          Same accept as the header button: an empty folder is exactly where a first
          3D model gets uploaded, and this input offering images alone is what made
          the media page look as though it had never learned to take one. */}
      {canUpload && (
        <input
          ref={whitespaceUploadRef}
          type="file"
          accept={UPLOAD_ACCEPT_ATTR}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files && e.target.files.length > 0) enqueueFiles(e.target.files); e.target.value = '' }}
        />
      )}

      {/* And the one behind every Replace action. Single-file: a replacement is one
          file taking one item's place, so there is nothing to do with a second.
          Image-only on purpose - Replace is offered only on items the server can
          decode (canReplace), which a 3D model never is. */}
      {canUpload && (
        <input
          ref={replaceInputRef}
          type="file"
          accept={IMAGE_ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            const id = replaceTargetId.current
            replaceTargetId.current = null
            e.target.value = ''
            if (file && id) replaceItem(id, file)
          }}
        />
      )}
    </div>
  )
}

// --- shared styles ---
const inputStyle: CSSProperties = { padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', width: '100%', fontFamily: 'inherit', fontSize: 'var(--text-base)', background: 'var(--color-surface)', color: 'var(--color-text)' }
const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', background: 'var(--color-bg-subtle)', position: 'sticky', top: '0.5rem', zIndex: 30 }

function EmptyState({ loading, search, hasFilters, canUpload, scopedSearchIn, onChoose, onClearFilters, onSearchEverywhere }: {
  loading: boolean
  search: string
  hasFilters: boolean
  canUpload: boolean
  /** Folder name a fruitless search was confined to, or null when it already spanned the library. */
  scopedSearchIn: string | null
  onChoose: () => void
  onClearFilters: () => void
  onSearchEverywhere: () => void
}) {
  const filteredEmpty = !loading && hasFilters
  const offerWiderSearch = filteredEmpty && !!search && !!scopedSearchIn
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '3.5rem 1rem', border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-subtle)' }}>
      <span style={{ fontSize: '2.25rem' }} aria-hidden>{filteredEmpty ? '🔍' : '🗂️'}</span>
      <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', fontWeight: 500 }}>
        {loading
          ? 'Loading…'
          : filteredEmpty
            ? search
              ? offerWiderSearch ? `Nothing in ${scopedSearchIn} matches your search` : 'Nothing matches your search'
              : 'Nothing matches these filters'
            : 'This folder is empty'}
      </span>
      {offerWiderSearch && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onSearchEverywhere}>Search all folders</button>
      )}
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
      onClick={() => fn()}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.75rem', border: 'none', background: 'transparent', color: disabled ? 'var(--color-text-muted)' : danger ? 'var(--color-destructive)' : 'var(--color-text)', cursor: disabled ? 'default' : 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}
    >
      {label}
    </button>
  )
}

function ContextMenu({ menu, canUpload, canDelete, hasClipboard, canEdit, canOptimise, canMarkOptimised, markedOptimised, canReplace, onOpen, onOptimise, onMarkOptimised, onReplace, onCopyLink, onDownload, onCut, onCopy, onPaste, onRename, onMove, onTags, onEdit, onChangeRatio, onResize, onDelete }: {
  menu: { x: number; y: number }
  canUpload: boolean; canDelete: boolean; hasClipboard: boolean; canEdit: boolean; canOptimise: boolean; canMarkOptimised: boolean; markedOptimised: boolean; canReplace: boolean
  onOpen: () => void; onOptimise: () => void; onMarkOptimised: () => void; onReplace: () => void; onCopyLink: () => void; onDownload: () => void; onCut: () => void; onCopy: () => void; onPaste: () => void; onRename: () => void; onMove: () => void; onTags: () => void; onEdit: () => void; onChangeRatio: () => void; onResize: () => void; onDelete: () => void
}) {
  return (
    <MenuShell menu={menu} height={420}>
      {menuItem('Open details', onOpen)}
      {menuItem('Copy link', onCopyLink)}
      {menuItem('Download', onDownload)}
      {canUpload && canOptimise && menuItem('Optimise', onOptimise)}
      {canUpload && canMarkOptimised && menuItem(markedOptimised ? 'Mark as not optimised' : 'Mark as optimised', onMarkOptimised)}
      {canUpload && canReplace && menuItem('Replace file…', onReplace)}
      {canUpload && canEdit && menuItem('Edit image…', onEdit)}
      {canUpload && canEdit && menuItem('Change ratio…', onChangeRatio)}
      {canUpload && canEdit && menuItem('Resize…', onResize)}
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

// The upload half of the same question, asked before the bytes go up. Separate
// from CollisionDialog because the choices aren't quite the same: "Keep both"
// can name the file it is about to create, and Cancel abandons the rest of the
// batch rather than the one file (Skip does that).
function UploadClashDialog({ name, suggestedName, remaining, onChoose }: {
  name: string
  suggestedName: string
  remaining: number
  onChoose: (choice: UploadChoice, applyToAll: boolean) => void
}) {
  // With more than one clash in the batch, offer to apply this answer to the
  // rest - ticked by default, so the usual case is one dialog, not one per file.
  // Cancel ignores it; it stops the whole batch either way.
  const [applyToAll, setApplyToAll] = useState(true)
  const others = remaining - 1
  return (
    <Overlay onCancel={() => onChoose('cancel', false)}>
      <h2 style={dialogTitle}>“{name}” is already in this folder</h2>
      <p style={dialogText}>
        Replace the file that&apos;s there (everything already using it picks up the new one), or keep both and upload this one as “{suggestedName}”.
      </p>
      {others > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
          Do the same for the other {others} {others === 1 ? 'file' : 'files'} with a clashing name
        </label>
      )}
      <DialogButtons>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChoose('cancel', false)}>Cancel</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChoose('skip', applyToAll)}>Skip</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => onChoose('replace', applyToAll)}>Replace</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onChoose('suffix', applyToAll)}>Keep both</button>
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
