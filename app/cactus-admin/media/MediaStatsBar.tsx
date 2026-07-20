'use client'

import type { CSSProperties } from 'react'
import { formatBytes } from './format'
// Type-only import - erased at build, so the server-only stats module (and its
// prisma import) never reaches the client bundle.
import type { LibraryStats } from '@/lib/media/library-stats'

export type { LibraryStats }

// The library overview. Four tiles: a plain total, storage used, the reclaimable
// "unused" set, and the raster images still worth optimising. The last two are
// actionable - clicking them narrows the grid to exactly those files so the
// admin can act on them, and they take an accent colour while there's work to do.
export default function MediaStatsBar({
  stats,
  folderCount,
  activeFilter,
  onShowAll,
  onShowUnused,
  onShowOptimisable,
}: {
  stats: LibraryStats
  folderCount: number
  /** Which tile's filter is currently applied, so it can read as selected. */
  activeFilter: 'all' | 'unused' | 'optimisable' | 'other'
  onShowAll: () => void
  onShowUnused: () => void
  onShowOptimisable: () => void
}) {
  const hasUnused = stats.unusedFiles > 0
  const hasOptimisable = stats.optimisableFiles > 0

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-5)',
      }}
    >
      <Tile
        label="Files"
        value={stats.totalFiles.toLocaleString('en-GB')}
        sub={`${folderCount} folder${folderCount === 1 ? '' : 's'}`}
        active={activeFilter === 'all'}
        onClick={onShowAll}
      />
      <Tile label="Storage used" value={formatBytes(stats.totalSize)} sub="across the library" />
      <Tile
        label="Unused"
        value={stats.unusedFiles.toLocaleString('en-GB')}
        sub={hasUnused ? `${formatBytes(stats.unusedSize)} reclaimable` : 'nothing spare'}
        accent={hasUnused ? 'warning' : undefined}
        active={activeFilter === 'unused'}
        onClick={hasUnused ? onShowUnused : undefined}
      />
      <Tile
        label="Optimisable"
        value={stats.optimisableFiles.toLocaleString('en-GB')}
        // Counted against everything the optimiser handles rather than against
        // the image count, which stopped being the same number when 3D models
        // became optimisable - a library of models read "0 of 0 images done"
        // while the tile beside it offered a dozen files to optimise. Done plus
        // still-to-do is the whole set by definition, and needs no new tally.
        sub={
          stats.optimisedFiles + stats.optimisableFiles > 0
            ? `${stats.optimisedFiles} of ${stats.optimisedFiles + stats.optimisableFiles} files done`
            : 'nothing to optimise yet'
        }
        accent={hasOptimisable ? 'info' : undefined}
        active={activeFilter === 'optimisable'}
        onClick={hasOptimisable ? onShowOptimisable : undefined}
      />
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  accent,
  active,
  onClick,
}: {
  label: string
  value: string
  sub: string
  accent?: 'warning' | 'info'
  active?: boolean
  onClick?: () => void
}) {
  const accentColor =
    accent === 'warning' ? 'var(--color-warning)' : accent === 'info' ? 'var(--color-info)' : 'var(--color-text)'
  const base: CSSProperties = {
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
    padding: 'var(--space-3) var(--space-4)',
    background: 'var(--color-surface)',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: 'var(--radius-md)',
    boxShadow: active ? '0 0 0 1px var(--color-primary)' : 'var(--shadow-sm)',
    fontFamily: 'inherit',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'border-color var(--dur-base), box-shadow var(--dur-base)',
    minWidth: 0,
  }
  const content = (
    <>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, color: accentColor, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{sub}</span>
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={base}>
        {content}
      </button>
    )
  }
  return <div style={base}>{content}</div>
}
