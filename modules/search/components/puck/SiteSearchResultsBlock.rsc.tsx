import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getMemberFromCookie } from '@/lib/members/session'
import { searchDocuments, searchProductIds, parseSourcesParam, resolveSearchableSources, type SnippetLength } from '@/modules/search/lib/query'
import { SOURCE_LABELS, type SearchHit, type SearchSourceKey } from '@/modules/search/lib/types'
import { searchCss } from '../public/search-css'
import { ResultRow, ProductCardLite, ArticleCardLite, groupHits, type HitDisplayOptions } from '../public/ResultCard'
import LoadMoreButton from '../public/LoadMoreButton'
import { siteSearchResultsPuckComponent, resultsSourcesFromProps, searchResultsPaddingClasses, type SiteSearchResultsBlockProps } from './SiteSearchResultsBlock'
import { SharedStyle } from '@/components/SharedStyle'

// Server (RSC) half of Search Results. Reads the query injected by the
// /search page (inject-search-context.ts) and hits the index directly.

type ShopCardsProvider = {
  renderProductCards?: (productIds: string[], opts?: { columns?: number }) => Promise<ReactNode | null>
}

// Whichever module offers a filter panel over a set of products (filters-for-shop
// today). Read by id-agnostic lookup rather than by name: the point is the
// contract, and search has no business knowing which module answers it.
type ProductFiltersProvider = {
  renderFilteredProductCards?: (productIds: string[], opts?: { columns?: number; pageSize?: number }) => Promise<ReactNode | null>
}

// How many products the filter grid is built over. Every one of them is
// server-rendered as a card up front (the shell shows a page at a time), so this
// is a page-weight ceiling as much as a relevance one - and nothing past the
// hundred-and-twentieth most relevant match was going to be scrolled to.
const PRODUCT_GRID_LIMIT = 120

function href(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') sp.set(key, String(value))
  }
  return `?${sp.toString()}`
}

export async function SiteSearchResultsBlockRsc(props: SiteSearchResultsBlockProps) {
  await connection()

  // Audience gate, before any index work: on 'Admins only' the whole results
  // list is withheld from the public. `getSessionFromCookie` is React-cached, so
  // the members-tier read further down reuses this lookup. (Field is `audience`,
  // not `visibility` - core strips a same-named responsive field from render
  // props, which would swallow the gate.)
  if (props.audience === 'admin') {
    const admin = await getSessionFromCookie().catch(() => null)
    if (!admin) return null
  }

  const q = (props.searchQuery ?? '').trim()
  const page = Math.max(1, props.searchPageNum ?? 1)
  const sort = props.searchSort === 'newest' ? 'newest' as const : 'relevance' as const
  const perPage = Math.max(5, Math.min(50, props.perPage ?? 20))
  const layout = props.layout === 'grid' ? 'grid' : props.layout === 'compact' ? 'compact' : 'list'
  const snippetLength = (['short', 'medium', 'long'].includes(props.snippetLength ?? '') ? props.snippetLength : 'medium') as SnippetLength
  const display: HitDisplayOptions = {
    showThumbnails: props.showThumbnails !== 'no',
    showExcerpts: props.showExcerpts !== 'no',
    showTypeBadges: props.showTypeBadges !== 'no',
    showPrices: props.showPrices !== 'no',
    showDates: props.showDates !== 'no',
    showAuthors: props.showAuthors === 'yes',
    showUrls: props.showUrls === 'yes',
    highlight: props.highlightMatches !== 'no',
  }

  const style = <SharedStyle id="site-search" css={searchCss()} />
  // Left/right gutter, same string the editor half paints - without it a search
  // layout that holds nothing but these blocks runs edge to edge on every screen.
  const padClass = searchResultsPaddingClasses(props)

  if (!q) {
    return (
      <div className={`srch-results ${padClass}`.trimEnd()}>
        {style}
        <div className="srch-empty" style={{ padding: '2rem 1rem' }}>Type something in the search box to get going.</div>
      </div>
    )
  }

  // The page-level ?sources= (filter tabs, or a narrowed search box) can only
  // narrow this block's own toggles further, never widen them.
  const blockSources = resultsSourcesFromProps(props)
  const paramSources = parseSourcesParam(props.searchSourcesParam)
  const effectiveSources = paramSources.length
    ? (blockSources.length ? paramSources.filter((s) => blockSources.includes(s)) : paramSources)
    : blockSources

  // Designed shop cards, stamped by the shop module through the
  // search.shop-cards extension point. Absent provider = standard cards.
  // Dynamic on purpose: a static edge from here to the generated registry
  // closes an import cycle, because the registry imports this module's own
  // contributed components and they reach back to this file. Turbopack can
  // fail a production build on that with "Cannot access 'x' before
  // initialization" while every local check stays green. See
  // scripts/check-import-cycles.mjs.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const provider = (moduleExtensionPointComponents['search.shop-cards']?.shop ?? null) as ShopCardsProvider | null
  // Unset means shop cards: a block saved from the starter arrangement (and the
  // /search page's no-layout fallback) carries no explicit pick, and rows there
  // would contradict the dropdown showing designed cards for the same products.
  // An owner who chose 'standard' has it written into the layout data, so this
  // default never overrides them.
  const wantShopCards = (props.productCardStyle ?? 'shopCard') === 'shopCard' && Boolean(provider?.renderProductCards)
  const filtersProvider = (Object.values(moduleExtensionPointComponents['search.product-filters'] ?? {})[0] ?? null) as ProductFiltersProvider | null

  // Session (admin or member) widens results to members-only content.
  const [adminUser, member, tabSources, searchable] = await Promise.all([
    getSessionFromCookie().catch(() => null),
    getMemberFromCookie().catch(() => null),
    // Filter tabs list every source this BLOCK is allowed to search - not the
    // narrowed set the current tab is searching. Reading the narrowed set is
    // what made the whole tab bar vanish the moment a tab was clicked, leaving
    // no way back to All.
    resolveSearchableSources(blockSources.length ? blockSources : undefined),
    resolveSearchableSources(effectiveSources.length ? effectiveSources : undefined),
  ])
  const includeMembersTier = Boolean(adminUser || member)
  const activeTab = paramSources.length === 1 ? paramSources[0] : null

  // The filter panel over the product results, when a module offers one and the
  // products are in scope. Built over EVERY matching product rather than the
  // page of them this render would have shown: a panel offering "Blue" that only
  // knew about page one would hide the blue product on page two, which is the
  // very thing the shopper is filtering to find.
  const wantFilterGrid = wantShopCards
    && props.productFilters !== 'no'
    && Boolean(filtersProvider?.renderFilteredProductCards)
    && searchable.includes('shop-product')
  const gridProductIds = wantFilterGrid
    ? await searchProductIds({ q, includeMembersTier, limit: PRODUCT_GRID_LIMIT })
    : []
  let filterGridNode: ReactNode = null
  if (gridProductIds.length > 0 && filtersProvider?.renderFilteredProductCards) {
    try {
      filterGridNode = await filtersProvider.renderFilteredProductCards(gridProductIds, {
        columns: parseInt(props.columns ?? '3', 10) || 3,
        pageSize: perPage,
      })
    } catch {
      filterGridNode = null
    }
  }
  // Nothing to filter by (or the provider failed): the products go back in the
  // paged list exactly as they did before any of this existed.
  const usingFilterGrid = filterGridNode !== null
  const listSources = usingFilterGrid ? searchable.filter((s) => s !== 'shop-product') : searchable

  const result = listSources.length > 0
    ? await searchDocuments({
        q,
        sources: listSources,
        includeMembersTier,
        limit: perPage,
        offset: (page - 1) * perPage,
        sort,
        highlight: display.highlight && display.showExcerpts,
        snippetLength,
      })
    : { hits: [], total: 0, sources: [], relaxed: false }
  const { hits } = result
  // The pager pages the LIST, so its total is the list's - the products live in
  // the grid above it and page themselves. The count line still says how many
  // were found altogether, which is what a shopper reads it as. Only added where
  // the grid actually rendered: everywhere else the products are still IN the
  // list, and counting them twice is how a count line starts lying.
  const total = usingFilterGrid ? result.total + gridProductIds.length : result.total

  const heading = (props.headingTemplate ?? 'Results for "{query}"').replace('{query}', q)
  const countLine = (props.countTemplate ?? '{count} results').replace('{count}', String(total))

  const productHits = wantShopCards ? hits.filter((h) => h.source === 'shop-product') : []
  let shopCardsNode: ReactNode = null
  if (wantShopCards && productHits.length > 0 && provider?.renderProductCards) {
    try {
      shopCardsNode = await provider.renderProductCards(
        productHits.map((h) => h.entityId),
        { columns: parseInt(props.columns ?? '3', 10) || 3 },
      )
    } catch {
      shopCardsNode = null
    }
  }
  const usingShopCards = shopCardsNode !== null && productHits.length > 0
  const remainingHits = usingShopCards ? hits.filter((h) => h.source !== 'shop-product') : hits

  // Articles as cards: the same picture-title-standfirst-byline card the
  // gazette listing shows, in their own grid, for the same reason the products
  // get one - a card cannot interleave with rows, and an article next to a
  // product card looked like the poor relation.
  const wantArticleCards = (props.articleCardStyle ?? 'card') === 'card'
  const articleHits = wantArticleCards ? remainingHits.filter((h) => h.source === 'gazette-post') : []
  const usingArticleCards = articleHits.length > 0
  const listHits = usingArticleCards ? remainingHits.filter((h) => h.source !== 'gazette-post') : remainingHits
  const gridColumns = props.columns ?? '3'

  const renderHit = (hit: SearchHit) => (
    layout === 'grid' && hit.source === 'shop-product'
      ? <ProductCardLite key={`${hit.source}:${hit.entityId}`} hit={hit} />
      : <ResultRow key={`${hit.source}:${hit.entityId}`} hit={hit} opts={display} />
  )
  const renderList = (list: SearchHit[]) => (
    layout === 'grid' ? (
      <div className="srch-grid" style={{ ['--srch-cols' as string]: props.columns ?? '3' } as React.CSSProperties}>
        {list.map(renderHit)}
      </div>
    ) : (
      <div className={`srch-list${layout === 'compact' ? ' srch-list-compact' : ''}`}>
        {list.map(renderHit)}
      </div>
    )
  )

  // Pages of the LIST. Never of `total`, which counts the grid's products too -
  // paging over a number bigger than the list offers empty pages at the end.
  const totalPages = Math.max(1, Math.ceil(result.total / perPage))
  // Load-more cannot append server-stamped shop cards - numbered wins there.
  const paginationStyle = props.paginationStyle === 'loadMore' && !usingShopCards ? 'loadMore' : 'numbered'
  const pageHref = (n: number) => href({
    q,
    sources: props.searchSourcesParam || undefined,
    sort: sort === 'newest' ? 'newest' : undefined,
    page: n > 1 ? n : undefined,
  })

  const pageLinks: ReactNode[] = []
  if (paginationStyle === 'numbered' && totalPages > 1) {
    const windowStart = Math.max(1, page - 3)
    const windowEnd = Math.min(totalPages, page + 3)
    if (windowStart > 1) pageLinks.push(<a key={1} className="srch-page-link" href={pageHref(1)}>1</a>, <span key="s">…</span>)
    for (let n = windowStart; n <= windowEnd; n++) {
      pageLinks.push(
        <a key={n} className={`srch-page-link${n === page ? ' srch-page-active' : ''}`} href={pageHref(n)}>{n}</a>,
      )
    }
    if (windowEnd < totalPages) pageLinks.push(<span key="e">…</span>, <a key={totalPages} className="srch-page-link" href={pageHref(totalPages)}>{totalPages}</a>)
  }

  return (
    <div className={`srch-results srch-thumb-${props.thumbnailShape ?? 'landscape'} ${padClass}`.trimEnd()}>
      {style}
      {heading !== '' && <h1 className="srch-res-heading">{heading}</h1>}
      {countLine !== '' && <p className="srch-res-count">{countLine}</p>}

      {props.filterTabs !== 'no' && tabSources.length > 1 && (
        <div className="srch-tabs">
          <a className={`srch-tab${activeTab === null ? ' srch-tab-active' : ''}`} href={href({ q, sort: sort === 'newest' ? 'newest' : undefined })}>All</a>
          {tabSources.map((source) => (
            <a
              key={source}
              className={`srch-tab${activeTab === source ? ' srch-tab-active' : ''}`}
              href={href({ q, sources: source, sort: sort === 'newest' ? 'newest' : undefined })}
            >
              {SOURCE_LABELS[source]}
            </a>
          ))}
        </div>
      )}

      {props.sortControl === 'yes' && total > 1 && (
        <div className="srch-sortrow">
          <a className={sort === 'relevance' ? 'srch-sort-active' : ''} href={href({ q, sources: props.searchSourcesParam || undefined })}>Most relevant</a>
          <a className={sort === 'newest' ? 'srch-sort-active' : ''} href={href({ q, sources: props.searchSourcesParam || undefined, sort: 'newest' })}>Newest</a>
        </div>
      )}

      {hits.length === 0 && !usingFilterGrid ? (
        <div className="srch-empty" style={{ padding: '2rem 1rem' }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>{props.emptyTitle?.trim() || 'Nothing found'}</p>
          <p style={{ margin: '.375rem 0 0' }}>{props.emptyBody?.trim() || 'No matches for that. Check the spelling, or try fewer words.'}</p>
        </div>
      ) : (
        <>
          {usingFilterGrid && <div className="srch-section">{filterGridNode}</div>}
          {usingShopCards && <div className="srch-section">{shopCardsNode}</div>}
          {usingArticleCards && (
            <div className="srch-section">
              {props.groupBySource === 'yes' && <div className="srch-group-label">{SOURCE_LABELS['gazette-post']}</div>}
              <div className="srch-grid" style={{ ['--srch-cols' as string]: gridColumns } as React.CSSProperties}>
                {articleHits.map((hit) => (
                  <ArticleCardLite key={`${hit.source}:${hit.entityId}`} hit={hit} />
                ))}
              </div>
            </div>
          )}
          {listHits.length > 0 && (
            props.groupBySource === 'yes' ? (
              groupHits(listHits).map((group) => (
                <div key={group.source} className="srch-section">
                  <div className="srch-group-label">{SOURCE_LABELS[group.source as SearchSourceKey]}</div>
                  {renderList(group.hits)}
                </div>
              ))
            ) : renderList(listHits)
          )}
          {paginationStyle === 'numbered' && pageLinks.length > 0 && (
            <nav className="srch-pagination" aria-label="Search result pages">{pageLinks}</nav>
          )}
          {paginationStyle === 'loadMore' && (
            <LoadMoreButton
              query={q}
              sources={listSources}
              perPage={perPage}
              startOffset={page * perPage}
              total={result.total}
              layout={layout}
              columns={gridColumns}
              articleCards={wantArticleCards}
              display={display}
              snippetLength={snippetLength}
              label="Load more"
            />
          )}
        </>
      )}
    </div>
  )
}

export const siteSearchResultsPuckRscComponent = {
  ...siteSearchResultsPuckComponent,
  render: SiteSearchResultsBlockRsc,
}
