import { connection } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { searchCss } from '../public/search-css'
import SearchBoxClient, { type SearchBoxPublicConfig } from '../public/SearchBoxClient'
import { searchBoxColourVars, searchBoxPaddingClasses, searchOpenWidth, searchSizeStyles, siteSearchPuckComponent, sourcesFromProps, type SiteSearchBlockProps } from './SiteSearchBlock'
import { SharedStyle } from '@/components/SharedStyle'

// Server (RSC) half of the Search Box. Only the display subset of the props
// crosses to the client island - and every prop here IS display config, so the
// mapping below is a whitelist rather than a spread (Puck's injected bag with
// its functions must never reach a client component).
//
// This half also owns the 'Admins only' audience gate: it reads the admin
// session cookie via @/lib/auth/session (next/headers + Prisma), which is
// server-only and must stay out of the editor bundle in SiteSearchBlock.tsx.

function toConfig(props: SiteSearchBlockProps): SearchBoxPublicConfig {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
  return {
    mode: pick(props.mode, ['page', 'inline', 'overlay'] as const, 'page'),
    minChars: Math.max(1, Math.min(10, props.minChars ?? 2)),
    debounceMs: parseInt(props.debounce ?? '250', 10) || 250,
    maxResults: Math.max(1, Math.min(20, props.maxResults ?? 8)),
    groupResults: props.groupResults !== 'no',
    hotkey: pick(props.hotkey, ['none', 'slash', 'modk'] as const, 'none'),
    autoFocus: props.autoFocus === 'yes',
    resultsPath: props.resultsPath?.trim() || '/search',
    sources: sourcesFromProps(props),
    presentation: pick(props.presentation, ['field', 'iconButton', 'fieldWithButton'] as const, 'field'),
    iconOpens: pick(props.iconOpens, ['overlay', 'bar'] as const, 'overlay'),
    // 0 means "no override" - the glyph then comes from the Size setting's
    // --srch-icon, exactly as it did before this field existed.
    iconSize: Math.max(0, Math.min(64, props.iconSize ?? 0)),
    placeholder: props.placeholder ?? 'Search…',
    buttonLabel: props.buttonLabel?.trim() || 'Search',
    ariaLabel: props.ariaLabel?.trim() || 'Search this site',
    showIcon: props.showIcon !== 'no',
    // Size resolves to a desktop class plus (only when a breakpoint differs) a
    // media rule scoped to this box - see searchSizeStyles.
    ...(() => { const { sizeClass, sizeCss } = searchSizeStyles(props.size, props.id); return { sizeClass, sizeCss } })(),
    blockId: props.id ?? '',
    cornerStyle: pick(props.cornerStyle, ['square', 'rounded', 'pill'] as const, 'rounded'),
    fieldStyle: pick(props.fieldStyle, ['outlined', 'filled', 'minimal'] as const, 'outlined'),
    accent: pick(props.accent, ['primary', 'link', 'neutral'] as const, 'primary'),
    // Undefined unless at least one colour was picked, so an uncoloured box
    // still renders without a style attribute of its own.
    boxVars: searchBoxColourVars(props),
    // Left/right gutter classes for the box's root, resolved here rather than
    // in the island: the editor half paints the same string onto the same
    // element, and the two must not be able to drift.
    padClass: searchBoxPaddingClasses(props),
    widthMode: pick(props.widthMode, ['full', 'fixed'] as const, 'full'),
    widthPx: Math.max(120, Math.min(1200, props.widthPx ?? 320)),
    align: pick(props.align, ['left', 'centre', 'right'] as const, 'left'),
    dropdownWidth: pick(props.dropdownWidth, ['field', 'container', 'viewport'] as const, 'field'),
    // Per-breakpoint width the live field takes when the overlay opens, plus
    // the site's breakpoint widths for the island to compare against.
    ...searchOpenWidth(props),
    productDisplay: pick(props.productDisplay, ['rows', 'cards', 'shopCards'] as const, 'rows'),
    articleDisplay: pick(props.articleDisplay, ['rows', 'cards'] as const, 'cards'),
    dropdownColumns: parseInt(props.dropdownColumns ?? '4', 10) || 4,
    display: {
      showThumbnails: props.showThumbnails !== 'no',
      showExcerpts: props.showExcerpts !== 'no',
      showTypeBadges: props.showTypeBadges !== 'no',
      showPrices: props.showPrices !== 'no',
      showDates: false,
      showAuthors: false,
      showUrls: false,
      highlight: props.highlightMatches !== 'no',
    },
    viewAllLabel: props.viewAllLabel?.trim() || 'See all results for "{query}"',
    emptyText: props.emptyText?.trim() || 'No results. Try a different word or two.',
    // Injected on the /search results page so the box shows the current query.
    initialQuery: props.searchQuery ?? '',
  }
}

// When `audience` is 'admin' the box is withheld from the public and rendered
// only for a signed-in site admin; 'everyone' (the default) skips the session
// read entirely so the common case stays cacheable.
export async function SiteSearchBlockRsc(props: SiteSearchBlockProps) {
  if (props.audience === 'admin') {
    // connection() opts this render out of static caching so the cookie check
    // runs per request - otherwise an admin's view could be cached and served
    // to the public, or vice versa.
    await connection()
    const admin = await getSessionFromCookie()
    if (!admin) return null
  }
  return (
    <>
      <SharedStyle id="site-search" css={searchCss()} />
      <SearchBoxClient config={toConfig(props)} />
    </>
  )
}

export const siteSearchPuckRscComponent = {
  ...siteSearchPuckComponent,
  render: SiteSearchBlockRsc,
}
