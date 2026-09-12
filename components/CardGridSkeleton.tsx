import type { CSSProperties } from 'react'

// The space a grid of cards will occupy, held while it streams.
//
// WHY THE GRIDS STREAM AT ALL. A grid block is an async server component, and an
// async component with no Suspense boundary above it blocks the WHOLE first
// flush - so the header, the hero and everything else on the page wait for the
// slowest product query on it. Measured on the live homepage: five grid blocks,
// 24 cards, and a cold time-to-first-byte of 2.9 seconds, against 0.70s for the
// guided finder's own page - which does far more work but was already behind a
// boundary. The work is identical either way; what changes is that the page
// starts arriving immediately and the grids fill in.
//
// This is the same trick, and the same reasoning, as DiscoveryFlowLoading in
// product-discovery-tool - which is where it was proven. It lives in CORE rather
// than in shop because four blocks across three modules need it (shop's product
// grid, featured collection and related products; filters' own grid; product
// attributes' grid), and three near-copies of a placeholder is how three of them
// end up reserving the wrong height.
//
// HEIGHT IS THE WHOLE JOB. A fallback shorter than the grid it stands in for
// means the page jumps when the real cards land, which is worse than waiting:
// the shopper has already started reading. So it reserves the same column count
// and the same number of tiles, each a square picture over two lines of text,
// which is the shape of every card design shop ships. Tokens only, no client
// component, nothing to load.
//
// Deliberately NOT a shimmer. A pulsing skeleton on a block that usually arrives
// in a few hundred milliseconds reads as breakage rather than progress, and an
// animation is the one thing here that could cost a frame.

const CARD: CSSProperties = {
  display: 'grid',
  gap: 8,
}

const PICTURE: CSSProperties = {
  aspectRatio: '1 / 1',
  background: 'var(--color-bg-subtle)',
  borderRadius: 'var(--img-radius, 6px)',
}

const LINE: CSSProperties = {
  height: '0.7rem',
  background: 'var(--color-bg-subtle)',
  borderRadius: 3,
}

/**
 * A placeholder grid of `count` tiles in `columns` columns.
 *
 * `aria-hidden` with a polite busy region around it: a screen reader should hear
 * "loading" once, not read out a dozen empty tiles. The real grid replaces this
 * wholesale, so nothing here is ever announced twice.
 */
export function CardGridSkeleton({ columns, count }: { columns: number; count: number }) {
  const cols = Math.max(1, Math.min(6, Math.floor(columns) || 3))
  // One full row at least, and never more tiles than the grid will hold - a
  // twelve-tile placeholder for a four-product collection reserves three rows
  // that never arrive, which is the same layout shift in the other direction.
  const tiles = Math.max(1, Math.min(24, Math.floor(count) || cols))
  return (
    <div aria-busy="true" aria-live="polite">
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        Loading products…
      </span>
      <div
        aria-hidden="true"
        style={{
          display: 'grid',
          // `min(100%, …)` rather than a bare minimum: an auto-fit track with a
          // fixed floor picks two columns that do not fit on a narrow phone and
          // overflows the page. Same rule as the real grids use.
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 'var(--shop-card-gap, 16px)',
        }}
      >
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} style={CARD}>
            <div style={PICTURE} />
            <div style={{ ...LINE, width: '80%' }} />
            <div style={{ ...LINE, width: '40%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
