import type { ReactNode } from 'react'
import { SNIPPET_START, SNIPPET_END, SOURCE_LABELS, type SearchHit, type SearchSourceKey } from '@/modules/search/lib/types'

// Shared presentational pieces for search hits - used by the RSC results
// block, the client dropdown and the client load-more appender, so all three
// render identical markup. No server imports, no 'use client': pure components
// are usable from both sides of the boundary.

// ts_headline output is plain text with « » markers around matches. It is
// rendered as React text nodes (never HTML), the markers becoming <mark>.
export function renderSnippet(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let rest = text
  let key = 0
  while (rest.length > 0) {
    const start = rest.indexOf(SNIPPET_START)
    if (start === -1) {
      out.push(rest)
      break
    }
    const end = rest.indexOf(SNIPPET_END, start + 1)
    if (end === -1) {
      out.push(rest.replaceAll(SNIPPET_START, ''))
      break
    }
    if (start > 0) out.push(rest.slice(0, start))
    out.push(<mark key={key++} className="srch-mark">{rest.slice(start + 1, end)}</mark>)
    rest = rest.slice(end + 1)
  }
  return out
}

export function formatHitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Long form, for the article card only: the gazette listing writes its dates
// out in full ("3 September 2026") and a card that says "3 Sep 2026" beside it
// reads as a different site.
export function formatHitDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export type HitDisplayOptions = {
  showThumbnails: boolean
  showExcerpts: boolean
  showTypeBadges: boolean
  showPrices: boolean
  showDates: boolean
  showAuthors: boolean
  showUrls: boolean
  highlight: boolean
}

function hitText(hit: SearchHit, opts: HitDisplayOptions): ReactNode {
  if (!opts.showExcerpts) return null
  if (opts.highlight && hit.snippet) return renderSnippet(hit.snippet)
  return hit.excerpt
}

export function HitPrice({ hit }: { hit: SearchHit }) {
  if (!hit.price) return null
  return (
    <span>
      <span className="srch-price">{hit.price.from ? 'From ' : ''}{hit.price.symbol}{hit.price.now}</span>
      {hit.price.was && <span className="srch-price-was">{hit.price.symbol}{hit.price.was}</span>}
    </span>
  )
}

export function ResultRow({ hit, opts, active, id }: {
  hit: SearchHit
  opts: HitDisplayOptions
  active?: boolean
  id?: string
}) {
  const author = typeof hit.extra?.author === 'string' ? hit.extra.author : null
  const text = hitText(hit, opts)
  return (
    <a
      className={`srch-row${active ? ' srch-active' : ''}`}
      href={hit.url}
      id={id}
      role={id ? 'option' : undefined}
      aria-selected={id ? active : undefined}
    >
      {opts.showThumbnails ? (
        <span className="srch-row-thumb">
          {hit.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- plain stored URLs, sizes unknown at build
            <img src={hit.imageUrl} alt="" loading="lazy" />
          )}
        </span>
      ) : <span />}
      <span className="srch-row-main">
        <span className="srch-row-title">{hit.title}</span>
        {text && <span className="srch-row-excerpt">{text}</span>}
        <span className="srch-row-meta">
          {opts.showTypeBadges && <span className="srch-badge">{SOURCE_LABELS[hit.source]}</span>}
          {opts.showPrices && <HitPrice hit={hit} />}
          {opts.showDates && hit.date && hit.source !== 'shop-product' && (
            <span style={{ fontSize: '.75rem', color: 'var(--color-text-muted)' }}>{formatHitDate(hit.date)}</span>
          )}
          {opts.showAuthors && author && (
            <span style={{ fontSize: '.75rem', color: 'var(--color-text-muted)' }}>{author}</span>
          )}
          {opts.showUrls && (
            <span style={{ fontSize: '.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit.url}</span>
          )}
        </span>
      </span>
    </a>
  )
}

// Product-card lookalike for dropdown card mode and the results grid. Close to
// a shop card (image, name, price, sale strike) but deliberately search-owned:
// the owner's designed Product Card template can only be stamped server-side
// (see the search.shop-cards extension point).
export function ProductCardLite({ hit, active, id }: { hit: SearchHit; active?: boolean; id?: string }) {
  return (
    <a
      className={`srch-card${active ? ' srch-active' : ''}`}
      href={hit.url}
      id={id}
      role={id ? 'option' : undefined}
      aria-selected={id ? active : undefined}
    >
      <span className="srch-card-img" style={{ display: 'block' }}>
        {hit.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- plain stored URLs, sizes unknown at build
          <img src={hit.imageUrl} alt="" loading="lazy" />
        )}
      </span>
      <span className="srch-card-body" style={{ display: 'block' }}>
        <span className="srch-card-name" style={{ display: 'block' }}>{hit.title}</span>
        <span className="srch-card-pricerow" style={{ display: 'block' }}>
          <HitPrice hit={hit} />
        </span>
      </span>
    </a>
  )
}

// Article lookalike of the card above, in the running order the gazette listing
// uses: square picture, title, the standfirst that feeds and social previews
// show, then author and date. Search-owned markup - a module never reaches into
// another module's components - but a real <h3>, so the site's own heading font
// paints the title exactly as it does on the gazette index.
//
// The standfirst, author and date are part of this card's format rather than
// the row toggles' business: those describe the standard result row. A header
// box set to "Show excerpts: no" - a sensible thing to want when the results
// are one-line rows - was otherwise stripping the summary out of the card and
// leaving a picture, a headline and a byline with nothing between them. An
// owner who wants the terse version has "Articles shown as: rows".
export function ArticleCardLite({ hit, active, id }: {
  hit: SearchHit
  active?: boolean
  id?: string
}) {
  const author = typeof hit.extra?.author === 'string' ? hit.extra.author : null
  return (
    <a
      className={`srch-acard${active ? ' srch-active' : ''}`}
      href={hit.url}
      id={id}
      role={id ? 'option' : undefined}
      aria-selected={id ? active : undefined}
    >
      <span className="srch-acard-img">
        {hit.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- plain stored URLs, sizes unknown at build
          <img src={hit.imageUrl} alt="" loading="lazy" />
        )}
      </span>
      {/* A div, not a span: the heading and the standfirst are flow content and
          have no business inside phrasing content. <a> is transparent, so this
          nests legally. */}
      <div className="srch-acard-body">
        <h3 className="srch-acard-title">{hit.title}</h3>
        {hit.excerpt && <p className="srch-acard-excerpt">{hit.excerpt}</p>}
        {(author || hit.date) && (
          <span className="srch-acard-meta">
            {author && <span>{author}</span>}
            {hit.date && <span>{formatHitDateLong(hit.date)}</span>}
          </span>
        )}
      </div>
    </a>
  )
}

export function groupHits(hits: SearchHit[]): Array<{ source: SearchSourceKey; hits: SearchHit[] }> {
  const groups = new Map<SearchSourceKey, SearchHit[]>()
  for (const hit of hits) {
    const list = groups.get(hit.source)
    if (list) list.push(hit)
    else groups.set(hit.source, [hit])
  }
  return [...groups.entries()].map(([source, grouped]) => ({ source, hits: grouped }))
}
