'use client'

import { useState } from 'react'

export type FolderNode = { id: string; name: string; parentId: string | null; mediaCount: number }

export default function FolderTree({
  folders,
  rootCount,
  currentFolderId,
  canManage,
  canDelete,
  onNavigate,
  onDropItems,
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
  onNewFolder: () => void
  onRenameFolder: (folder: FolderNode) => void
  onDeleteFolder: (folder: FolderNode) => void
}) {
  const roots = folders.filter((f) => !f.parentId).sort((a, b) => a.name.localeCompare(b.name))
  const childrenOf = (id: string) => folders.filter((f) => f.parentId === id).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <nav aria-label="Media folders" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: 'var(--text-sm)' }}>
      <Row
        label="Media"
        count={rootCount}
        active={currentFolderId === null}
        depth={0}
        onClick={() => onNavigate(null)}
        onDrop={(raw) => onDropItems(null, raw)}
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
          onNavigate={onNavigate}
          onDropItems={onDropItems}
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
  folder, depth, currentFolderId, canManage, canDelete, childrenOf, onNavigate, onDropItems, onRenameFolder, onDeleteFolder,
}: {
  folder: FolderNode; depth: number; currentFolderId: string | null; canManage: boolean; canDelete: boolean
  childrenOf: (id: string) => FolderNode[]
  onNavigate: (id: string | null) => void
  onDropItems: (targetFolderId: string | null, raw: string) => void
  onRenameFolder: (f: FolderNode) => void
  onDeleteFolder: (f: FolderNode) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const kids = childrenOf(folder.id)
  return (
    <>
      <Row
        label={folder.name}
        count={folder.mediaCount}
        active={currentFolderId === folder.id}
        depth={depth}
        hasChildren={kids.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
        onClick={() => onNavigate(folder.id)}
        onDrop={(raw) => onDropItems(folder.id, raw)}
        actions={
          canManage ? (
            <>
              <IconButton title="Rename folder" onClick={() => onRenameFolder(folder)}>✎</IconButton>
              {canDelete && <IconButton title="Delete folder" danger onClick={() => onDeleteFolder(folder)}>🗑</IconButton>}
            </>
          ) : null
        }
      />
      {expanded && kids.map((c) => (
        <FolderRow
          key={c.id}
          folder={c}
          depth={depth + 1}
          currentFolderId={currentFolderId}
          canManage={canManage}
          canDelete={canDelete}
          childrenOf={childrenOf}
          onNavigate={onNavigate}
          onDropItems={onDropItems}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </>
  )
}

function Row({
  label, count, active, depth, hasChildren, expanded, onToggle, onClick, onDrop, actions,
}: {
  label: string; count: number; active: boolean; depth: number
  hasChildren?: boolean; expanded?: boolean; onToggle?: () => void
  onClick: () => void; onDrop: (raw: string) => void; actions?: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/plain')) }}
      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: `${depth * 0.85}rem`, borderRadius: 'var(--radius-sm)', background: over ? 'var(--color-primary)' : active ? 'var(--color-bg-subtle)' : 'transparent', color: over ? 'var(--color-primary-contrast, #fff)' : 'var(--color-text)' }}
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
