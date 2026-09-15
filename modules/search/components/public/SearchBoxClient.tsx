'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { SearchHit } from '@/modules/search/lib/types'
import { SOURCE_LABELS, type SearchSourceKey } from '@/modules/search/lib/types'
import { ResultRow, ProductCardLite, ArticleCardLite, groupHits, type HitDisplayOptions } from './ResultCard'
import { adoptHoistedStyles } from '@/modules/search/lib/adopt-hoisted-styles'

// The live search island. Receives only the display subset of the block's
// props (client props land verbatim in view-source); rendered by
// SiteSearchBlock.rsc, which also emits the stylesheet.

// 'wide' is the 0.1.26 spelling of 'container', kept working so a block that
// stored it keeps behaving. Both mean "grow leftwards to the edge of whatever
// this box shares its space with".
export type OpenWidth = 'field' | 'container' | 'viewport'

export type SearchBoxPublicConfig = {
  mode: 'page' | 'inline' | 'overlay'
  minChars: number
  debounceMs: number
  maxResults: number
  groupResults: boolean
  hotkey: 'none' | 'slash' | 'modk'
  autoFocus: boolean
  resultsPath: string
  sources: string[]
  presentation: 'field' | 'iconButton' | 'fieldWithButton'
  // Icon button only: where the live field goes when the magnifier is tapped,
  // and an explicit glyph size (0 = take it from the Size setting) for lining
  // the magnifier up with whatever other icons share its row.
  iconOpens: 'overlay' | 'bar'
  iconSize: number
  placeholder: string
  buttonLabel: string
  ariaLabel: string
  showIcon: boolean
  // Appearance size, resolved upstream: the desktop class plus the media rules
  // for any breakpoint that differs (empty when the box has one size at every
  // width), and the block id those rules are scoped to.
  sizeClass: string
  // Optional --srch-bg/--srch-border/--srch-fg overrides; undefined when the
  // box has no colour set, so nothing is emitted for the common case.
  boxVars?: React.CSSProperties
  sizeCss: string
  blockId: string
  cornerStyle: 'square' | 'rounded' | 'pill'
  fieldStyle: 'outlined' | 'filled' | 'minimal'
  accent: 'primary' | 'link' | 'neutral'
  // Left/right gutter utility classes for the box's root, resolved server-side
  // (searchBoxPaddingClasses) so the canvas and the live page paint the same
  // string. Empty when the box takes no gutter, which is most of them.
  padClass: string
  widthMode: 'full' | 'fixed'
  widthPx: number
  align: 'left' | 'centre' | 'right'
  dropdownWidth: 'field' | 'container' | 'viewport'
  // Overlay mode with a field trigger only: how wide the live field grows when
  // it opens, per breakpoint. 'container' and 'viewport' both keep the field's
  // right-hand edge where the trigger's was and grow leftwards, so an opened
  // header search covers whatever sits beside it instead of shoving the row
  // about. `breakpoints` is the site's own tablet/mobile widths, resolved
  // server-side, so the island can tell which breakpoint it is on.
  openWidth: { desktop: OpenWidth; tablet: OpenWidth; mobile: OpenWidth }
  breakpoints: { mobile: number; tablet: number }
  productDisplay: 'rows' | 'cards' | 'shopCards'
  articleDisplay: 'rows' | 'cards'
  dropdownColumns: number
  display: HitDisplayOptions
  viewAllLabel: string
  emptyText: string
  initialQuery: string
}

function SearchIcon() {
  return (
    <svg className="srch-iconsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="srch-iconsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function resultsHref(config: SearchBoxPublicConfig, q: string): string {
  const params = new URLSearchParams({ q })
  if (config.sources.length) params.set('sources', config.sources.join(','))
  return `${config.resultsPath || '/search'}?${params.toString()}`
}

export default function SearchBoxClient({ config }: { config: SearchBoxPublicConfig }) {
  const [q, setQ] = useState(config.initialQuery)
  const [open, setOpen] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [searched, setSearched] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const seqRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const baseId = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const listboxId = `srch-list-${baseId}`

  // Designed shop cards ('shopCards'): the shop's Product Card template can
  // only be stamped server-side, so the island fetches /search/cards (an RSC
  // page) and lifts the `#srch-shop-cards` fragment into the dropdown. Keyed by
  // the product-id list, cached for the session; `html: null` records a fetch
  // or extraction failure for that key, which drops that render back to the
  // search-owned ProductCardLite so the dropdown never goes quietly product-less.
  const [shopCards, setShopCards] = useState<{ key: string; html: string | null } | null>(null)
  const shopCardsCacheRef = useRef<Map<string, string | null>>(new Map())

  const live = config.mode !== 'page'
  // iconButton and overlay mode both put the real input inside the overlay
  // panel; the in-flow element is only a trigger.
  const usesOverlay = config.presentation === 'iconButton' || config.mode === 'overlay'
  // A field trigger has a place on the page, so its overlay input must open
  // exactly over it (anchored to the trigger's rect) rather than in a centred
  // panel. The icon button keeps the centred panel: a tiny button is no anchor.
  const anchored = config.mode === 'overlay' && config.presentation !== 'iconButton'
  // The icon button's other opening: a full-width bar pinned directly under the
  // header the button lives in, instead of a panel over the page. Meant for a
  // phone header, where a centred panel is a screenful of nothing under one
  // input and a page-wide dropdown is wider than the page.
  const usesBar = config.presentation === 'iconButton' && config.iconOpens === 'bar'
  const [barTop, setBarTop] = useState(0)
  // cw = documentElement.clientWidth (viewport sans scrollbar), captured with the
  // rect so the results panel can be sized against the real viewport.
  // containerLeft = how far left the field may grow: see measureAnchor.
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number; height: number; cw: number; containerLeft: number } | null>(null)

  const measureAnchor = useCallback(() => {
    const el = boxRef.current
    const r = el?.getBoundingClientRect()
    if (!el || !r) return
    // The left edge a widened field is allowed to reach: the nearest ancestor
    // that actually has room to the box's left - in a header, the cell the box
    // shares with the menu button, whose left edge is where the logo's cell
    // ends. Measured rather than configured because that edge moves with the
    // viewport: a fixed pixel width pins the wrong end and swallows the logo
    // as the screen narrows. Ancestors that match the box exactly (Puck's own
    // per-block wrappers, a column the box fills) are skipped, as are
    // display:contents wrappers, which measure zero.
    let containerLeft = r.left
    for (let a = el.parentElement; a && a.tagName !== 'BODY'; a = a.parentElement) {
      const ar = a.getBoundingClientRect()
      if (ar.width === 0) continue
      if (ar.left < r.left - 1) { containerLeft = ar.left; break }
    }
    setAnchorRect({ top: r.top, left: r.left, width: r.width, height: r.height, cw: document.documentElement.clientWidth, containerLeft })
  }, [])

  // Where the bar's top edge sits: the bottom of the header this box is in, so
  // the field lands under the whole header row (menu, logo, the lot) rather
  // than under the button. No header - a box dropped in page content - and it
  // falls back to the box's own bottom edge, which is the same idea.
  const measureBar = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    const host = el.closest('header') ?? el
    setBarTop(Math.max(0, Math.round(host.getBoundingClientRect().bottom)))
  }, [])

  const openOverlay = useCallback(() => {
    if (anchored) measureAnchor()
    if (usesBar) measureBar()
    setOverlayOpen(true)
  }, [anchored, measureAnchor, usesBar, measureBar])

  const runSearch = useCallback((term: string) => {
    const seq = ++seqRef.current
    const params = new URLSearchParams({
      q: term,
      limit: String(config.maxResults),
      highlight: config.display.highlight ? 'yes' : 'no',
      snippet: 'short',
    })
    if (config.sources.length) params.set('sources', config.sources.join(','))
    fetch(`/api/m/search/public/query?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { hits: [], total: 0 }))
      .then((data: { hits?: SearchHit[]; total?: number }) => {
        if (seq !== seqRef.current) return
        setHits(data.hits ?? [])
        setTotal(data.total ?? 0)
        setSearched(true)
        setActiveIndex(-1)
        setOpen(true)
      })
      .catch(() => {
        if (seq !== seqRef.current) return
        setHits([])
        setTotal(0)
        setSearched(true)
      })
  }, [config.maxResults, config.display.highlight, config.sources])

  const onChange = (value: string) => {
    setQ(value)
    if (!live && !usesOverlay) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const term = value.trim()
    if (term.length < config.minChars) {
      seqRef.current++
      setHits([])
      setSearched(false)
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(term), config.debounceMs)
  }

  // Fetch the server-stamped card fragment whenever the product ids in view
  // change.
  const productHitIds = config.productDisplay === 'shopCards'
    ? hits.filter((h) => h.source === 'shop-product').map((h) => h.entityId)
    : []
  const shopCardsKey = productHitIds.join(',')
  useEffect(() => {
    if (!shopCardsKey) return
    const cached = shopCardsCacheRef.current.get(shopCardsKey)
    if (cached !== undefined) {
      setShopCards({ key: shopCardsKey, html: cached })
      return
    }
    // Staleness is settled by the ids this fetch was for, never by the search
    // sequence. Keying it off the sequence stranded the dropdown on skeletons
    // for good: a keystroke that lands on the SAME products leaves the key
    // unchanged, so the effect never re-runs - and the one response there was
    // got thrown away for carrying an older sequence number.
    let cancelled = false
    const params = new URLSearchParams({ ids: shopCardsKey, cols: String(config.dropdownColumns) })
    fetch(`/search/cards?${params.toString()}`)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        const doc = text ? new DOMParser().parseFromString(text, 'text/html') : null
        const fragment = doc ? doc.getElementById('srch-shop-cards') : null
        // An empty fragment (shop closed, every id filtered out) is a "no" too.
        const html = fragment && fragment.innerHTML.trim() !== '' ? fragment.innerHTML : null
        // The cards' own stylesheets live in that document's <head>, not in the
        // fragment. Bring the missing ones with them.
        if (doc && html) adoptHoistedStyles(doc)
        // Only a real response is worth remembering. Caching the null a 500
        // produces would hold those products on the plain fallback card for the
        // rest of the session over one bad moment.
        if (text !== null) shopCardsCacheRef.current.set(shopCardsKey, html)
        if (cancelled) return
        setShopCards({ key: shopCardsKey, html })
      })
      .catch(() => {
        if (cancelled) return
        setShopCards({ key: shopCardsKey, html: null })
      })
    return () => { cancelled = true }
  }, [shopCardsKey, config.dropdownColumns])

  // Close the inline dropdown on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus the real input when the overlay opens.
  useEffect(() => {
    if (overlayOpen) inputRef.current?.focus()
  }, [overlayOpen])

  // Full-viewport dropdown: CSS alone cannot span the viewport from an
  // absolutely-positioned child (left:50%/-50vw only works when the box sits
  // dead-centre of the page - in a header it doesn't). Measure the box's
  // viewport offset and pull the dropdown back by exactly that much.
  const viewportDd = config.mode === 'inline' && config.dropdownWidth === 'viewport'
  const [viewportInset, setViewportInset] = useState<number | null>(null)
  useEffect(() => {
    if (!open || !viewportDd) return
    const sync = () => {
      const r = boxRef.current?.getBoundingClientRect()
      if (r) setViewportInset(r.left)
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [open, viewportDd])

  // Keep the anchored input glued to the trigger: the page behind the overlay
  // can still scroll (and the window resize), which would strand a one-shot
  // rect measurement where the trigger used to be.
  useEffect(() => {
    if (!overlayOpen || !anchored) return
    window.addEventListener('resize', measureAnchor)
    window.addEventListener('scroll', measureAnchor, true)
    return () => {
      window.removeEventListener('resize', measureAnchor)
      window.removeEventListener('scroll', measureAnchor, true)
    }
  }, [overlayOpen, anchored, measureAnchor])

  // Same treatment for the bar: a sticky header holds still while the page
  // scrolls, a static one doesn't, and neither survives a rotation unmeasured.
  useEffect(() => {
    if (!overlayOpen || !usesBar) return
    window.addEventListener('resize', measureBar)
    window.addEventListener('scroll', measureBar, true)
    return () => {
      window.removeEventListener('resize', measureBar)
      window.removeEventListener('scroll', measureBar, true)
    }
  }, [overlayOpen, usesBar, measureBar])

  // Focus hotkey.
  useEffect(() => {
    if (config.hotkey === 'none') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const slash = config.hotkey === 'slash' && e.key === '/' && !typing && !e.metaKey && !e.ctrlKey
      const modk = config.hotkey === 'modk' && e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)
      if (!slash && !modk) return
      e.preventDefault()
      if (usesOverlay) openOverlay()
      else inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [config.hotkey, usesOverlay, openOverlay])

  // The X on the right of the live field: puts the box back to how it was
  // before anyone touched it - overlay and bar shut, dropdown shut, field
  // empty, nothing in flight, focus released.
  const closeSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    seqRef.current++
    setQ('')
    setHits([])
    setTotal(0)
    setSearched(false)
    setActiveIndex(-1)
    setOpen(false)
    setOverlayOpen(false)
    inputRef.current?.blur()
  }, [])

  const goToResults = useCallback(() => {
    const term = q.trim()
    if (!term) return
    window.location.href = resultsHref(config, term)
  }, [q, config])

  const showsResults = live || usesOverlay

  // Which hits the arrow keys walk. Server-stamped shop cards are fetched HTML
  // with no per-option ids to point aria-activedescendant at, so in that state
  // products drop out of keyboard navigation (they stay mouse/touch links);
  // while the fragment loads they are skeletons, equally unnavigable. Only the
  // ProductCardLite fallback (html === null) keeps products in the walk.
  const shopCardsReady = config.productDisplay === 'shopCards' && shopCards?.key === shopCardsKey
  const shopCardsHtml = shopCardsReady ? shopCards!.html : undefined
  const productsNavigable = config.productDisplay !== 'shopCards' || shopCardsHtml === null
  const navHits = useMemo(
    () => (productsNavigable ? hits : hits.filter((h) => h.source !== 'shop-product')),
    [productsNavigable, hits],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setOverlayOpen(false)
      return
    }
    const listVisible = showsResults && (open || overlayOpen) && hits.length > 0
    if (!listVisible) {
      if (e.key === 'Enter') {
        e.preventDefault()
        goToResults()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(navHits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(-1, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const active = activeIndex >= 0 ? navHits[activeIndex] : null
      if (active) window.location.href = active.url
      else goToResults()
    }
  }

  const appearanceClasses = [
    config.sizeClass,
    `srch-corner-${config.cornerStyle}`,
    `srch-style-${config.fieldStyle}`,
    `srch-accent-${config.accent}`,
  ].join(' ')
  // Per-breakpoint size overrides for this box only (empty unless a breakpoint
  // differs from desktop). Rendered inside the box so it travels with the block.
  const sizeStyle = config.sizeCss ? <style dangerouslySetInnerHTML={{ __html: config.sizeCss }} /> : null
  const boxClasses = [
    'srch-box',
    appearanceClasses,
    config.widthMode === 'fixed' ? `srch-align-${config.align}` : '',
    config.padClass,
  ].filter(Boolean).join(' ')
  const boxStyle: React.CSSProperties = config.widthMode === 'fixed'
    ? { width: config.widthPx, maxWidth: '100%' }
    : { width: '100%' }
  // Merged onto every root this component can render - the two field boxes, the
  // icon trigger and the fixed bar - because each is a separate element and the
  // custom properties have to land on whichever one is actually on the page.
  const boxStyleWithVars: React.CSSProperties = { ...boxStyle, ...config.boxVars }

  const optionId = useCallback((i: number) => `${listboxId}-opt-${i}`, [listboxId])

  const resultsBody = useMemo(() => {
    if (!searched) return null
    if (hits.length === 0) {
      return <div className="srch-empty">{config.emptyText}</div>
    }
    const cardsMode = config.productDisplay === 'cards' || config.productDisplay === 'shopCards'
    const productHits = cardsMode ? hits.filter((h) => h.source === 'shop-product') : []
    const afterProducts = cardsMode ? hits.filter((h) => h.source !== 'shop-product') : hits
    // Articles as cards, same component the results page uses. Unlike the shop
    // cards these are ours to stamp, so they stay in the arrow-key walk.
    const articleHits = config.articleDisplay === 'cards'
      ? afterProducts.filter((h) => h.source === 'gazette-post')
      : []
    const rowHits = articleHits.length > 0
      ? afterProducts.filter((h) => h.source !== 'gazette-post')
      : afterProducts
    const indexOfHit = new Map(navHits.map((h, i) => [h, i]))
    const rows = (list: SearchHit[]) => list.map((hit) => (
      <ResultRow
        key={`${hit.source}:${hit.entityId}`}
        hit={hit}
        opts={config.display}
        active={indexOfHit.get(hit) === activeIndex}
        id={optionId(indexOfHit.get(hit) ?? 0)}
      />
    ))
    // The product section in shopCards mode: stamped fragment when it has
    // arrived, skeleton tiles while it is on its way, ProductCardLite when the
    // fetch failed or came back empty.
    const liteGrid = (
      <div className="srch-cardgrid" style={{ ['--srch-cols' as string]: String(config.dropdownColumns) } as React.CSSProperties}>
        {productHits.map((hit) => (
          <ProductCardLite
            key={`${hit.source}:${hit.entityId}`}
            hit={hit}
            active={indexOfHit.get(hit) === activeIndex}
            id={indexOfHit.has(hit) ? optionId(indexOfHit.get(hit) ?? 0) : undefined}
          />
        ))}
      </div>
    )
    const productSection = config.productDisplay !== 'shopCards' ? liteGrid
      : typeof shopCardsHtml === 'string' ? (
        // Server HTML from this site's own /search/cards page - the shop's
        // designed Product Card markup. Its stylesheets are not in here; they
        // were hoisted into this page's <head> by adoptHoistedStyles.
        <div className="srch-shopcards" dangerouslySetInnerHTML={{ __html: shopCardsHtml }} />
      ) : shopCardsHtml === null ? liteGrid : (
        <div className="srch-cardgrid" aria-hidden="true" style={{ ['--srch-cols' as string]: String(config.dropdownColumns) } as React.CSSProperties}>
          {productHits.slice(0, config.dropdownColumns * 2).map((hit) => (
            <span key={`${hit.source}:${hit.entityId}`} className="srch-card">
              <span className="srch-card-img" style={{ display: 'block' }} />
              <span className="srch-card-body" style={{ display: 'block' }}>
                <span style={{ display: 'block', height: 12, width: '80%', background: 'var(--color-border)', borderRadius: 4 }} />
                <span style={{ display: 'block', height: 10, width: '40%', background: 'var(--color-border)', borderRadius: 4, marginTop: 6 }} />
              </span>
            </span>
          ))}
        </div>
      )
    const articleSection = (
      <div className="srch-cardgrid" style={{ ['--srch-cols' as string]: String(config.dropdownColumns) } as React.CSSProperties}>
        {articleHits.map((hit) => (
          <ArticleCardLite
            key={`${hit.source}:${hit.entityId}`}
            hit={hit}
            active={indexOfHit.get(hit) === activeIndex}
            id={indexOfHit.has(hit) ? optionId(indexOfHit.get(hit) ?? 0) : undefined}
          />
        ))}
      </div>
    )
    return (
      <>
        {productHits.length > 0 && productSection}
        {articleHits.length > 0 && articleSection}
        {rowHits.length > 0 && (
          config.groupResults ? (
            groupHits(rowHits).map((group) => (
              <div key={group.source}>
                <div className="srch-group-label">{SOURCE_LABELS[group.source as SearchSourceKey]}</div>
                {rows(group.hits)}
              </div>
            ))
          ) : rows(rowHits)
        )}
        {total > hits.length && (
          <a className="srch-viewall" href={resultsHref(config, q.trim())}>
            {config.viewAllLabel.replace('{query}', q.trim())}
          </a>
        )}
      </>
    )
  }, [searched, hits, navHits, shopCardsHtml, total, activeIndex, q, config, optionId])

  const inputEl = (
    <div className="srch-input-wrap">
      {config.showIcon && <SearchIcon />}
      <input
        ref={inputRef}
        className="srch-input"
        type="search"
        name="q"
        role="combobox"
        aria-label={config.ariaLabel}
        aria-expanded={showsResults && (open || overlayOpen)}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        placeholder={config.placeholder}
        value={q}
        autoFocus={config.autoFocus && !usesOverlay}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (live && !usesOverlay && searched && hits.length > 0) setOpen(true) }}
      />
      {config.presentation === 'fieldWithButton' && (
        <button type="button" className="srch-btn" onClick={goToResults}>{config.buttonLabel}</button>
      )}
      {/* Rightmost, past the button when there is one. In an overlay or bar
          there is always something to close, so it is always there; in a field
          that lives on the page it only appears once there is text to clear. */}
      {(usesOverlay || q !== '') && (
        <button
          type="button"
          className="srch-clear"
          aria-label={usesOverlay ? 'Close search' : 'Clear search'}
          onClick={closeSearch}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )

  // The bar. Rendered as a sibling of the button rather than through a portal:
  // position:fixed is enough to escape the header's own box, and staying in the
  // block's subtree keeps the editor canvas and the live page rendering the
  // same markup. The results list only exists once a search has run, which is
  // what keeps an untyped bar the height of its input.
  const bar = overlayOpen && (
    <>
      <div className="srch-bar-catcher" onClick={() => setOverlayOpen(false)} />
      <div className={`srch-bar ${appearanceClasses}`} style={{ top: barTop, ...config.boxVars }}>
        {inputEl}
        {searched && (
          <div
            className="srch-bar-results"
            role="listbox"
            id={listboxId}
            style={{ maxHeight: `calc(100vh - ${barTop}px - 5rem)` }}
          >
            <div className="srch-dd-inner">{resultsBody}</div>
          </div>
        )}
      </div>
    </>
  )

  const overlay = overlayOpen && (
    <div className="srch-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOverlayOpen(false) }}>
      {anchored && anchorRect ? (
        // The live input sits exactly where the trigger is, so opening the
        // overlay looks like clicking into the box, not a box teleporting.
        // The results panel below it honours the block's "Dropdown width":
        // field = match the box; container = a wide panel centred on the box
        // (clamped inside the viewport); viewport = edge to edge.
        (() => {
          const gutter = 8
          // Which breakpoint the viewport is on, by the site's own widths -
          // same ranges as responsiveMediaCssFor, so the field agrees with
          // every other per-breakpoint setting on the block.
          const device = anchorRect.cw <= config.breakpoints.mobile
            ? 'mobile'
            : anchorRect.cw <= config.breakpoints.tablet ? 'tablet' : 'desktop'
          const grow = config.openWidth[device]
          // Right edge pinned to the trigger's right edge; the field grows
          // leftwards from there, never past the gutter, and never narrower
          // than the trigger it replaced.
          const right = anchorRect.left + anchorRect.width
          const fieldWidth = grow === 'viewport'
            ? Math.max(anchorRect.width, anchorRect.cw - gutter * 2)
            : grow === 'container'
              ? Math.max(anchorRect.width, right - Math.max(gutter, anchorRect.containerLeft))
              : anchorRect.width
          const fieldLeft = grow === 'viewport'
            ? Math.max(gutter, Math.round((anchorRect.cw - fieldWidth) / 2))
            : right - fieldWidth
          const ddWidth = config.dropdownWidth === 'viewport'
            ? anchorRect.cw
            : config.dropdownWidth === 'container'
              ? Math.min(680, anchorRect.cw - gutter * 2)
              : fieldWidth
          const ddViewportLeft = config.dropdownWidth === 'viewport'
            ? 0
            : Math.max(gutter, Math.min(fieldLeft + (fieldWidth - ddWidth) / 2, anchorRect.cw - gutter - ddWidth))
          return (
            <div
              className={`srch-overlay-anchor ${appearanceClasses}`}
              style={{ top: anchorRect.top, left: fieldLeft, width: fieldWidth }}
            >
              {inputEl}
              {searched && (
                <div
                  className="srch-overlay-dd"
                  role="listbox"
                  id={listboxId}
                  style={{
                    position: 'relative',
                    left: ddViewportLeft - fieldLeft,
                    width: ddWidth,
                    maxHeight: `calc(100vh - ${anchorRect.top + anchorRect.height}px - 24px)`,
                    ...(config.dropdownWidth === 'viewport' ? { borderRadius: 0, borderLeft: 'none', borderRight: 'none' } : {}),
                  }}
                >
                  <div className="srch-dd-inner">{resultsBody}</div>
                </div>
              )}
            </div>
          )
        })()
      ) : (
        <div className={`srch-overlay-panel ${appearanceClasses}`}>
          <div className="srch-overlay-head">{inputEl}</div>
          <div className="srch-overlay-results" role="listbox" id={listboxId}>
            {searched && <div className="srch-dd-inner">{resultsBody}</div>}
          </div>
        </div>
      )}
    </div>
  )

  if (config.presentation === 'iconButton') {
    return (
      <div className={`${boxClasses} srch-box-icon`} data-srch-id={config.blockId || undefined} style={config.boxVars} ref={boxRef}>
        {sizeStyle}
        <button
          type="button"
          className="srch-iconbtn"
          aria-label={config.ariaLabel}
          aria-expanded={overlayOpen}
          onClick={openOverlay}
          // Set on the button, not the wrapper: the bar/overlay render inside
          // that wrapper, and their field's own magnifier should keep tracking
          // the Size setting rather than inheriting the trigger's glyph size.
          style={config.iconSize ? ({ '--srch-icon': `${config.iconSize}px` } as React.CSSProperties) : undefined}
        >
          <SearchIcon />
        </button>
        {usesBar ? bar : overlay}
      </div>
    )
  }

  if (config.mode === 'overlay') {
    // In-flow trigger only; the live input lives in the overlay panel.
    return (
      <div className={boxClasses} data-srch-id={config.blockId || undefined} style={boxStyleWithVars} ref={boxRef}>
        {sizeStyle}
        <button
          type="button"
          className="srch-input-wrap"
          style={{ width: '100%', cursor: 'text', textAlign: 'left' }}
          aria-label={config.ariaLabel}
          onClick={openOverlay}
        >
          {config.showIcon && <SearchIcon />}
          {/* Placeholder colour while it is empty, typed colour once there is a
              query in it - the class is the only difference, so the editor
              canvas (which only ever shows the placeholder) matches exactly. */}
          <span className={`srch-input srch-input-static${q.trim() ? ' srch-input-typed' : ''}`}>{q.trim() || config.placeholder}</span>
        </button>
        {overlay}
      </div>
    )
  }

  // 'page' mode is a plain GET form (works without JavaScript - the input is
  // name="q"); 'inline' adds the live dropdown on top of the same markup.
  return (
    <div className={boxClasses} data-srch-id={config.blockId || undefined} style={boxStyleWithVars} ref={boxRef}>
      {sizeStyle}
      <form
        action={config.resultsPath || '/search'}
        method="get"
        onSubmit={(e) => { e.preventDefault(); goToResults() }}
      >
        {config.sources.length > 0 && <input type="hidden" name="sources" value={config.sources.join(',')} />}
        {inputEl}
      </form>
      {config.mode === 'inline' && open && (
        <div
          className={`srch-dd${config.dropdownWidth === 'viewport' ? ' srch-dd-viewport' : config.dropdownWidth === 'container' ? ' srch-dd-wide' : ''}`}
          id={listboxId}
          role="listbox"
          style={viewportDd && viewportInset != null ? { left: -viewportInset, marginLeft: 0, width: '100vw' } : undefined}
        >
          <div className="srch-dd-inner">{resultsBody}</div>
        </div>
      )}
    </div>
  )
}
