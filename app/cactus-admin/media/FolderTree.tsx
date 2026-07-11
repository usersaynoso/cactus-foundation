'use client'

import { useMemo, useState } from 'react'

export type FolderNode = { id: string; name: string; parentId: string | null; mediaCount: number }

const FOLDER_DND_TYPE = 'application/x-cactus-folder'

export default function FolderTree({
  folders,
  rootCount,
  currentFolderId,
  canManage,
  canDelete,
  onNavigate,
  onDropItems,
  onMoveFolder,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
}: {
  folders: FolderNode[]
  rootCount: number
  currentFolderId: string | null
  canManage: boolean
  canDelete: boolean
  onNavigate: (id: string | null) => void
  onDropItems: (targetFolderId: string | null, raw: string) => void
  onMoveFolder: (folderId: string, targetParentId: string | null) => void
  onNewFolder: () => void
  onRenameFolder: (folder: FolderNode) => void
  onDeleteFolder: (folder: FolderNode) => void
}) {
  const roots = folders.filter((f) => !f.parentId).sort((a, b) => a.name.localeCompare(b.name))
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id).sort((a, b) => a.name.localeCompare(b.name))

  // The path from the root down to the current folder is always open — otherwise a
  // freshly created (or moved-in) subfolder stays hidden under a collapsed parent
  // and looks like nothing happened. User toggles layer on top of that.
  const forcedOpen = useMemo(() => {
    const s = new Set<string>()
    const byId = new Map(folders.map((f) => [f.id, f]))
    let id: string | null = currentFolderId
    let guard = 0
    while (id && guard++ < 50) { s.add(id); id = byId.get(id)?.parentId ?? null }
    return s
  }, [currentFolderId, folders])
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const isOpen = (id: string) => forcedOpen.has(id) || toggled.has(id)
  const toggle = (id: string) => setToggled((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <nav aria-label="Media folders" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: 'var(--text-sm)' }}>
      <Row
        label="Media"
        count={rootCount}
        active={currentFolderId === null}
        depth={0}
        onClick={() => onNavigate(null)}
        onDropItems={(raw) => onDropItems(null, raw)}
        onDropFolder={canManage ? (fid) => onMoveFolder(fid, null) : undefined}
      />
      {roots.map((f) => (
        <FolderRow
          key={f.id}
          folder={f}
          depth={1}
          currentFolderId={currentFolderId}
          canManage={canManage}
          canDelete={canDelete}
          childrenOf={childrenOf}
          isOpen={isOpen}
          onToggle={toggle}
          onNavigate={onNavigate}
          onDropItems={onDropItems}
          onMoveFolder={onMoveFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
      {canManage && (
        <button
          type="button"
          onClick={onNewFolder}
          style={{ marginTop: '0.5rem', textAlign: 'left', padding: '0.3rem 0.5rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontFamily: 'inherit' }}
        >
          + New folder
        </button>
      )}
    </nav>
  )
}

function FolderRow({
  folder, depth, currentFolderId, canManage, canDelete, childrenOf, isOpen, onToggle, onNavigate, onDropItems, onMoveFolder, onRenameFolder, onDeleteFolder,
}: {
  folder: FolderNode; depth: number; currentFolderId: string | null; canManage: boolean; canDelete: boolean
  childrenOf: (id: string) => FolderNode[]
  isOpen: (id: string) => boolean
  onToggle: (id: string) => void
  onNavigate: (id: string | null) => void
  onDropItems: (targetFolderId: string | null, raw: string) => void
  onMoveFolder: (folderId: string, targetParentId: string | null) => void
  onRenameFolder: (f: FolderNode) => void
  onDeleteFolder: (f: FolderNode) => void
}) {
  const open = isOpen(folder.id)
  const kids = childrenOf(folder.id)
  return (
    <>
      <Row
        label={folder.name}
        count={folder.mediaCount}
        active={currentFolderId === folder.id}
        depth={depth}
        hasChildren={kids.length > 0}
        expanded={open}
        onToggle={() => onToggle(folder.id)}
        onClick={() => onNavigate(folder.id)}
        onDropItems={(raw) => onDropItems(folder.id, raw)}
        onDropFolder={canManage ? (fid) => onMoveFolder(fid, folder.id) : undefined}
        draggableFolderId={canManage ? folder.id : undefined}
        actions={
          canManage ? (
            <>
              <IconButton title="Rename folder" onClick={() => onRenameFolder(folder)}>✎</IconButton>
              {canDelete && <IconButton title="Delete folder" danger onClick={() => onDeleteFolder(folder)}>🗑</IconButton>}
            </>
          ) : null
        }
      />
      {open && kids.map((c) => (
        <FolderRow
          key={c.id}
          folder={c}
          depth={depth + 1}
          currentFolderId={currentFolderId}
          canManage={canManage}
          canDelete={canDelete}
          childrenOf={childrenOf}
          isOpen={isOpen}
          onToggle={onToggle}
          onNavigate={onNavigate}
          onDropItems={onDropItems}
          onMoveFolder={onMoveFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </>
  )
}

function Row({
  label, count, active, depth, hasChildren, expanded, onToggle, onClick, onDropItems, onDropFolder, draggableFolderId, actions,
}: {
  label: string; count: number; active: boolean; depth: number
  hasChildren?: boolean; expanded?: boolean; onToggle?: () => void
  onClick: () => void
  onDropItems: (raw: string) => void
  /** Accept a dropped folder (move it here). Absent = folders can't be dropped here. */
  onDropFolder?: (folderId: string) => void
  /** When set, this row can be dragged onto another folder to move it. */
  draggableFolderId?: string
  actions?: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      draggable={!!draggableFolderId}
      onDragStart={draggableFolderId ? (e) => { e.dataTransfer.setData(FOLDER_DND_TYPE, draggableFolderId); e.dataTransfer.effectAllowed = 'move' } : undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false)
        const folderId = e.dataTransfer.getData(FOLDER_DND_TYPE)
        if (folderId) { onDropFolder?.(folderId); return }
        const raw = e.dataTransfer.getData('text/plain')
        if (raw) onDropItems(raw)
      }}
      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: `${depth * 0.85}rem`, borderRadius: 'var(--radius-sm)', background: over ? 'var(--color-primary)' : active ? 'var(--color-bg-subtle)' : 'transparent', color: over ? 'var(--color-primary-contrast, #fff)' : 'var(--color-text)', cursor: draggableFolderId ? 'grab' : 'default' }}
    >
      {hasChildren ? (
        <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', width: '1rem', padding: 0, fontSize: '0.7rem' }}>
          {expanded ? '▾' : '▸'}
        </button>
      ) : <span style={{ width: '1rem', display: 'inline-block' }} />}
      <button
        type="button"
        onClick={onClick}
        style={{ flex: 1, textAlign: 'left', border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '0.3rem 0.25rem', fontSize: 'var(--text-sm)', fontFamily: 'inherit', fontWeight: active ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label} <span style={{ color: over ? 'inherit' : 'var(--color-text-muted)', fontWeight: 400 }}>({count})</span>
      </button>
      {actions && <span style={{ display: 'inline-flex', gap: '0.15rem', paddingRight: '0.25rem' }}>{actions}</span>}
    </div>
  )
}

function IconButton({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: danger ? 'var(--color-destructive)' : 'var(--color-text-muted)', fontSize: '0.75rem', padding: '0.15rem', lineHeight: 1 }}
    >
      {children}
    </button>
  )
}
