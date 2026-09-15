import { searchCss, SRCH_SIZE_VARS } from '../public/search-css'
// Field widget via the registry, never a direct import of its own module: that
// module pulls in the Puck editor (and the TipTap it vendors), and this file is
// on the public render path. Same rule core's config.tsx follows.
import { ResponsiveSelectField, SiteColourField } from '@/lib/puck/fields/registry'
import { getResponsiveBreakpoints, normalizeResponsiveValue, pickResponsive, responsiveMediaCssFor, type Device, type ResponsiveValue } from '@/lib/puck/responsiveValue'
import { PADDING_OPTIONS, searchPaddingClasses } from '@/modules/search/lib/block-padding'
import type { SearchSourceKey } from '@/modules/search/lib/types'
import { SharedStyle } from '@/components/SharedStyle'

// Editor half only. The live render (with the client search island) is in
// ./SiteSearchBlock.rsc. This file reaches the Puck editor's client bundle
// through the generated module-components registry, so it must never import
// prisma or any server-only API.

// Cached fetch so resolveFields doesn't refetch on every panel keystroke.
type ProbeResult = { sources: Array<{ key: string; label: string }>; shopCardProvider: boolean }
let _probeCache: { data: ProbeResult; expires: number } | null = null
async function fetchProbe(): Promise<ProbeResult> {
  const now = Date.now()
  if (_probeCache && now < _probeCache.expires) return _probeCache.data
  try {
    const res = await fetch('/api/m/search/public/sources')
    if (!res.ok) return _probeCache?.data ?? { sources: [], shopCardProvider: false }
    const data = (await res.json()) as { sources?: Array<{ key: string; label: string }>; shopCardProvider?: boolean }
    _probeCache = { data: { sources: data.sources ?? [], shopCardProvider: data.shopCardProvider === true }, expires: now + 60_000 }
    return _probeCache.data
  } catch {
    return _probeCache?.data ?? { sources: [], shopCardProvider: false }
  }
}

export type SiteSearchBlockProps = {
  // Puck's own block id, injected on every render - scopes this box's CSS.
  id?: string
  // Behaviour
  mode?: string
  minChars?: number
  debounce?: string
  maxResults?: number
  groupResults?: string
  hotkey?: string
  autoFocus?: string
  resultsPath?: string
  // Content types
  searchPages?: string
  searchProducts?: string
  searchCategories?: string
  searchCollections?: string
  searchArticles?: string
  searchDirectory?: string
  searchForum?: string
  searchMembers?: string
  // Appearance
  presentation?: string
  iconOpens?: string
  iconSize?: number
  placeholder?: string
  buttonLabel?: string
  ariaLabel?: string
  showIcon?: string
  // Per-breakpoint (ResponsiveValue); a plain string is legacy desktop-only data
  // and normalises on read, so nothing needs migrating.
  size?: ResponsiveValue<string> | string
  cornerStyle?: string
  fieldStyle?: string
  accent?: string
  // Optional colour overrides for the box itself. Blank = the theme tokens the
  // box has always used. Each carries a light and a dark arm (light-dark()),
  // so a header that needs a different field colour after dark can say so
  // without a second block.
  boxBg?: string
  boxBorder?: string
  boxText?: string
  // Narrower than boxText, and win over it: the prompt in an empty box, and the
  // words someone has just typed. Blank = whatever boxText resolves to, which
  // is what every box did before these existed.
  boxPlaceholder?: string
  boxTyped?: string
  widthMode?: string
  widthPx?: number
  align?: string
  // Left/right gutter, per breakpoint. 'auto' (what an untouched box stores)
  // means the site gutter on the results page and none anywhere else - a header
  // box has to stay flush with the icons beside it.
  padding?: ResponsiveValue<string> | string
  // Dropdown results
  dropdownWidth?: string
  // Per-breakpoint, overlay-with-a-field only: how wide the field goes when it
  // opens.
  openWidth?: ResponsiveValue<string> | string
  productDisplay?: string
  articleDisplay?: string
  dropdownColumns?: string
  showThumbnails?: string
  showExcerpts?: string
  showTypeBadges?: string
  showPrices?: string
  highlightMatches?: string
  viewAllLabel?: string
  emptyText?: string
  // Audience. NB: keep this key as `audience`, never `visibility` - core owns a
  // responsive-visibility field of that exact name on every block and strips it
  // from render props, which would silently disable this gate.
  audience?: string
  // Injected by the /search page (inject-search-context.ts), never fields
  searchQuery?: string
  searchPageNum?: number
  searchSort?: string
  searchSourcesParam?: string
}

// Field name -> index source key, in sidebar order.
export const SOURCE_FIELD_MAP: ReadonlyArray<{ field: keyof SiteSearchBlockProps & string; key: SearchSourceKey; label: string }> = [
  { field: 'searchPages', key: 'page', label: 'Search pages' },
  { field: 'searchProducts', key: 'shop-product', label: 'Search products' },
  { field: 'searchCategories', key: 'shop-category', label: 'Search shop categories' },
  { field: 'searchCollections', key: 'shop-collection', label: 'Search shop collections' },
  { field: 'searchArticles', key: 'gazette-post', label: 'Search articles' },
  { field: 'searchDirectory', key: 'directory-entry', label: 'Search directory' },
  { field: 'searchForum', key: 'boards-thread', label: 'Search forum' },
  { field: 'searchMembers', key: 'member', label: 'Search members' },
]

// The explicit source list a block's toggles produce. Every toggle on = empty
// list, meaning "all enabled sources" - so a source added later joins
// automatically instead of being silently excluded by stored props.
export function sourcesFromProps(props: SiteSearchBlockProps): SearchSourceKey[] {
  const chosen = SOURCE_FIELD_MAP.filter((m) => props[m.field] !== 'no').map((m) => m.key)
  return chosen.length === SOURCE_FIELD_MAP.length ? [] : chosen
}

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

// Size is per-breakpoint: the desktop value rides the existing srch-size-* class
// (so a box that has never been touched renders byte-identically and emits no
// extra CSS), and any breakpoint that differs re-declares the three size vars in
// a media rule scoped to this one box by its Puck id. Shared by the editor half
// below and the RSC half, so the canvas and the live page can't drift.
export function searchSizeStyles(size: SiteSearchBlockProps['size'], id: string | undefined): { sizeClass: string; sizeCss: string } {
  const rv = normalizeResponsiveValue<string>(size)
  const at = (d: Device): 'small' | 'medium' | 'large' => {
    const v = pickResponsive(rv, d)
    return v === 'small' || v === 'large' ? v : 'medium'
  }
  return {
    sizeClass: `srch-size-${at('desktop')}`,
    sizeCss: id ? responsiveMediaCssFor(`[data-srch-id="${id}"]`, (d) => SRCH_SIZE_VARS[at(d)]) : '',
  }
}

// Width-when-open, resolved for all three breakpoints plus the site's own
// breakpoint widths. The island can't call getResponsiveBreakpoints itself -
// the client bundle gets its own copy of that module state, unset - so the
// numbers travel in the config. Shared with the RSC half for the usual reason:
// one place to change the cascade, not two.
//
// 'wide' is 0.1.26's spelling of 'container' and still resolves to it: that
// release asked for a pixel width instead of measuring the container, which
// pins the wrong end of the field and eats whatever is to its left as the
// screen narrows. Blocks that stored 'wide' get the fixed behaviour.
export function searchOpenWidth(props: Pick<SiteSearchBlockProps, 'openWidth'>): {
  openWidth: Record<Device, 'field' | 'container' | 'viewport'>
  breakpoints: { mobile: number; tablet: number }
} {
  const rv = normalizeResponsiveValue<string>(props.openWidth)
  const at = (d: Device): 'field' | 'container' | 'viewport' => {
    const v = pickResponsive(rv, d)
    if (v === 'viewport') return 'viewport'
    return v === 'container' || v === 'wide' ? 'container' : 'field'
  }
  return {
    openWidth: { desktop: at('desktop'), tablet: at('tablet'), mobile: at('mobile') },
    breakpoints: getResponsiveBreakpoints(),
  }
}

// The three colour overrides as inline custom properties, or undefined when
// none is set - so a box that has never been coloured emits no style attribute
// at all and renders byte-identically. Shared by the editor half, the RSC half
// and the live island, which each paint a different root element.
export function searchBoxColourVars(props: Pick<SiteSearchBlockProps, 'boxBg' | 'boxBorder' | 'boxText' | 'boxPlaceholder' | 'boxTyped'>): React.CSSProperties | undefined {
  const vars: Record<string, string> = {}
  if (props.boxBg?.trim()) vars['--srch-bg'] = props.boxBg.trim()
  if (props.boxBorder?.trim()) vars['--srch-border'] = props.boxBorder.trim()
  if (props.boxText?.trim()) vars['--srch-fg'] = props.boxText.trim()
  if (props.boxPlaceholder?.trim()) vars['--srch-placeholder'] = props.boxPlaceholder.trim()
  if (props.boxTyped?.trim()) vars['--srch-typed'] = props.boxTyped.trim()
  return Object.keys(vars).length ? (vars as React.CSSProperties) : undefined
}

// The gutter classes for this box. 'auto' only pads the arrangement that is a
// page in its own right - the results page's box, which posts to /search and
// sits in a bare layout with nothing else to space it. A box that opens a
// dropdown or an overlay, or is an icon trigger, is header chrome nine times
// out of ten and has to stay flush with the icons beside it, so it gets none.
// Either way an owner can say which they want on any box.
export function searchBoxPaddingClasses(props: Pick<SiteSearchBlockProps, 'padding' | 'mode' | 'presentation'>): string {
  const pageBox = (props.mode ?? 'page') === 'page' && props.presentation !== 'iconButton'
  return searchPaddingClasses(props.padding, pageBox ? 'default' : 'none')
}

export function SiteSearchBlock(props: SiteSearchBlockProps) {
  const { sizeClass, sizeCss } = searchSizeStyles(props.size, props.id)
  const boxClasses = [
    'srch-box',
    sizeClass,
    `srch-corner-${props.cornerStyle ?? 'rounded'}`,
    `srch-style-${props.fieldStyle ?? 'outlined'}`,
    `srch-accent-${props.accent ?? 'primary'}`,
    props.widthMode === 'fixed' ? `srch-align-${props.align ?? 'left'}` : '',
    searchBoxPaddingClasses(props),
  ].filter(Boolean).join(' ')
  const boxStyle: React.CSSProperties = props.widthMode === 'fixed'
    ? { width: props.widthPx ?? 320, maxWidth: '100%' }
    : { width: '100%' }
  const colourVars = searchBoxColourVars(props)

  return (
    <div
      className={props.presentation === 'iconButton' ? `${boxClasses} srch-box-icon` : boxClasses}
      // An icon button is its own width in the live render (no boxStyle at
      // all), so the canvas must not stretch it to 100% either - same markup,
      // same box, editor and page.
      style={colourVars || props.presentation !== 'iconButton' ? { ...(props.presentation === 'iconButton' ? undefined : boxStyle), ...colourVars } : undefined}
      data-srch-id={props.id}
    >
      <SharedStyle id="site-search" css={searchCss()} />
      {sizeCss && <style dangerouslySetInnerHTML={{ __html: sizeCss }} />}
      {props.presentation === 'iconButton' ? (
        <span
          className="srch-iconbtn"
          aria-hidden="true"
          style={props.iconSize ? ({ '--srch-icon': `${props.iconSize}px` } as React.CSSProperties) : undefined}
        >
          <svg className="srch-iconsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        </span>
      ) : (
        <div className="srch-input-wrap" aria-hidden="true">
          {props.showIcon !== 'no' && (
            <svg className="srch-iconsvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          )}
          <span className="srch-input srch-input-static">{props.placeholder || 'Search…'}</span>
          {props.presentation === 'fieldWithButton' && (
            <span className="srch-btn">{props.buttonLabel || 'Search'}</span>
          )}
        </div>
      )}
      {/* No preview of the dropdown results here. The canvas draws the box
          only: a ghost results panel is taller than the box itself, which
          pushed everything below it out of reach in a header layout. */}
    </div>
  )
}

export const siteSearchPuckComponent = {
  label: 'Search Box',
  fields: {
    // Behaviour
    mode: {
      type: 'select' as const, label: 'Results appear',
      options: [
        { value: 'page', label: 'On the results page' },
        { value: 'inline', label: 'In a dropdown while typing' },
        { value: 'overlay', label: 'In a full overlay while typing' },
      ],
    },
    minChars: { type: 'number' as const, label: 'Minimum characters before searching', min: 1, max: 10 },
    debounce: {
      type: 'select' as const, label: 'Typing pause before searching',
      options: [
        { value: '150', label: 'Short (150ms)' },
        { value: '250', label: 'Medium (250ms)' },
        { value: '400', label: 'Long (400ms)' },
      ],
    },
    maxResults: { type: 'number' as const, label: 'Results in the dropdown', min: 1, max: 20 },
    groupResults: { type: 'select' as const, label: 'Group results by content type', options: yesNo },
    hotkey: {
      type: 'select' as const, label: 'Keyboard shortcut to focus',
      options: [
        { value: 'none', label: 'None' },
        { value: 'slash', label: '/ (forward slash)' },
        { value: 'modk', label: 'Ctrl/Cmd + K' },
      ],
    },
    autoFocus: { type: 'select' as const, label: 'Focus on page load', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] },
    resultsPath: { type: 'text' as const, label: 'Results page path' },
    // Content types (narrowed to installed modules by resolveFields)
    ...Object.fromEntries(SOURCE_FIELD_MAP.map((m) => [m.field, { type: 'select' as const, label: m.label, options: yesNo }])),
    // Appearance
    presentation: {
      type: 'select' as const, label: 'Presentation',
      options: [
        { value: 'field', label: 'Search field' },
        { value: 'fieldWithButton', label: 'Field with button' },
        { value: 'iconButton', label: 'Icon button (opens overlay)' },
      ],
    },
    iconOpens: {
      type: 'select' as const, label: 'Tapping the icon opens',
      options: [
        { value: 'overlay', label: 'An overlay over the page' },
        { value: 'bar', label: 'A bar under the header' },
      ],
    },
    iconSize: { type: 'number' as const, label: 'Icon size in px (blank = follow Size)', min: 10, max: 64 },
    placeholder: { type: 'text' as const, label: 'Placeholder text' },
    buttonLabel: { type: 'text' as const, label: 'Button label' },
    ariaLabel: { type: 'text' as const, label: 'Screen-reader label' },
    showIcon: { type: 'select' as const, label: 'Show magnifier icon', options: yesNo },
    size: {
      type: 'custom' as const, label: 'Size',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ],
      render: ResponsiveSelectField,
    },
    cornerStyle: {
      type: 'select' as const, label: 'Corners',
      options: [
        { value: 'square', label: 'Square' },
        { value: 'rounded', label: 'Rounded' },
        { value: 'pill', label: 'Pill' },
      ],
    },
    fieldStyle: {
      type: 'select' as const, label: 'Field style',
      options: [
        { value: 'outlined', label: 'Outlined' },
        { value: 'filled', label: 'Filled' },
        { value: 'minimal', label: 'Minimal (underline)' },
      ],
    },
    accent: {
      type: 'select' as const, label: 'Accent colour',
      options: [
        { value: 'primary', label: 'Primary' },
        { value: 'link', label: 'Link colour' },
        { value: 'neutral', label: 'Neutral' },
      ],
    },
    boxBg: { type: 'custom' as const, label: 'Field background', render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
    boxBorder: { type: 'custom' as const, label: 'Field border colour', render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
    boxText: { type: 'custom' as const, label: 'Field text and icon colour', render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
    boxPlaceholder: { type: 'custom' as const, label: 'Placeholder text colour (blank = follow the field text)', render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
    boxTyped: { type: 'custom' as const, label: 'Typed text colour (blank = follow the field text)', render: ({ value, onChange, field }: { value: string; onChange: (v: string) => void; field: { label?: string } }) => <SiteColourField value={value} onChange={onChange} label={field.label} allowManual /> },
    widthMode: {
      type: 'select' as const, label: 'Width',
      options: [
        { value: 'full', label: 'Full width' },
        { value: 'fixed', label: 'Fixed width' },
      ],
    },
    widthPx: { type: 'number' as const, label: 'Width (px)', min: 120, max: 1200 },
    padding: {
      type: 'custom' as const, label: 'Padding (left/right)',
      options: PADDING_OPTIONS,
      render: ResponsiveSelectField,
    },
    align: {
      type: 'select' as const, label: 'Alignment',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'centre', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ],
    },
    // Dropdown results
    dropdownWidth: {
      type: 'select' as const, label: 'Dropdown width',
      options: [
        { value: 'field', label: 'Match the field' },
        { value: 'container', label: 'Wide panel' },
        { value: 'viewport', label: 'Full viewport width' },
      ],
    },
    openWidth: {
      type: 'custom' as const, label: 'Width when open',
      options: [
        { value: 'field', label: 'Same as the field' },
        { value: 'container', label: 'Fill its own space (grows leftwards)' },
        { value: 'viewport', label: 'Full screen width' },
      ],
      render: ResponsiveSelectField,
    },
    productDisplay: {
      type: 'select' as const, label: 'Products shown as',
      // 'shopCards' (the designed Product Card template, stamped by the shop
      // module) is stripped by resolveFields when no provider is registered.
      options: [
        { value: 'rows', label: 'Rows (like other results)' },
        { value: 'cards', label: 'Product cards' },
        { value: 'shopCards', label: 'Designed product cards (from the shop)' },
      ],
    },
    articleDisplay: {
      type: 'select' as const, label: 'Articles shown as',
      options: [
        { value: 'rows', label: 'Rows (like other results)' },
        { value: 'cards', label: 'Article cards' },
      ],
    },
    dropdownColumns: {
      type: 'select' as const, label: 'Card columns',
      options: [
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4' },
      ],
    },
    showThumbnails: { type: 'select' as const, label: 'Show thumbnails', options: yesNo },
    showExcerpts: { type: 'select' as const, label: 'Show excerpts', options: yesNo },
    showTypeBadges: { type: 'select' as const, label: 'Show content-type badges', options: yesNo },
    showPrices: { type: 'select' as const, label: 'Show product prices', options: yesNo },
    highlightMatches: { type: 'select' as const, label: 'Highlight matched words', options: yesNo },
    viewAllLabel: { type: 'text' as const, label: '"View all" label ({query} = search term)' },
    emptyText: { type: 'text' as const, label: 'No-results text' },
    // Audience. See the note on SiteSearchBlockProps: the key must stay
    // `audience`, never `visibility`.
    audience: {
      type: 'select' as const, label: 'Who can see this',
      options: [
        { value: 'everyone', label: 'Everyone' },
        { value: 'admin', label: 'Admins only' },
      ],
    },
  },
  defaultProps: {
    mode: 'page',
    minChars: 2,
    debounce: '250',
    maxResults: 8,
    groupResults: 'yes',
    hotkey: 'none',
    autoFocus: 'no',
    resultsPath: '/search',
    searchPages: 'yes',
    searchProducts: 'yes',
    searchCategories: 'yes',
    searchCollections: 'yes',
    searchArticles: 'yes',
    searchDirectory: 'yes',
    searchForum: 'yes',
    searchMembers: 'yes',
    presentation: 'field',
    iconOpens: 'overlay',
    placeholder: 'Search…',
    buttonLabel: 'Search',
    ariaLabel: 'Search this site',
    showIcon: 'yes',
    size: { desktop: 'medium' },
    cornerStyle: 'rounded',
    fieldStyle: 'outlined',
    accent: 'primary',
    boxBg: '',
    boxBorder: '',
    boxText: '',
    boxPlaceholder: '',
    boxTyped: '',
    widthMode: 'full',
    widthPx: 320,
    align: 'left',
    padding: { desktop: 'auto' },
    dropdownWidth: 'field',
    openWidth: { desktop: 'field' },
    productDisplay: 'rows',
    // Articles as cards, matching the results page's own default: an article
    // is a picture and a headline wherever it turns up, and a dropdown that
    // disagreed with the page it links to is the mismatch this replaced.
    articleDisplay: 'cards',
    dropdownColumns: '4',
    showThumbnails: 'yes',
    showExcerpts: 'yes',
    showTypeBadges: 'yes',
    showPrices: 'yes',
    highlightMatches: 'yes',
    viewAllLabel: 'See all results for "{query}"',
    emptyText: 'No results. Try a different word or two.',
    audience: 'everyone',
  },
  async resolveFields(data: { props: SiteSearchBlockProps }, { fields }: { fields: Record<string, unknown> }) {
    const next = { ...fields }
    const props = data.props ?? {}
    const probe = await fetchProbe()
    const available = probe.sources
    const availableKeys = new Set(available.map((s) => s.key))

    // Only offer toggles for sources this install actually has.
    for (const m of SOURCE_FIELD_MAP) {
      if (available.length > 0 && !availableKeys.has(m.key)) delete next[m.field]
    }
    const shopPresent = available.length === 0 || availableKeys.has('shop-product')

    // Without a registered shop-cards provider the designed-card option cannot
    // be honoured - trim it from the select rather than let it silently fall
    // back to plain rows at render time.
    if (!probe.shopCardProvider) {
      const pd = next.productDisplay as { options?: Array<{ value: string }> } | undefined
      if (pd?.options) next.productDisplay = { ...pd, options: pd.options.filter((o) => o.value !== 'shopCards') }
    }

    const mode = props.mode ?? 'page'
    if (mode === 'page') {
      delete next.minChars
      delete next.debounce
      delete next.maxResults
      delete next.groupResults
      delete next.dropdownWidth
      delete next.productDisplay
      delete next.articleDisplay
      delete next.dropdownColumns
      delete next.showThumbnails
      delete next.showExcerpts
      delete next.showTypeBadges
      delete next.showPrices
      delete next.highlightMatches
      delete next.viewAllLabel
      delete next.emptyText
    } else {
      const articlesPresent = available.length === 0 || availableKeys.has('gazette-post')
      const articleCards = articlesPresent && props.searchArticles !== 'no'
        && (props.articleDisplay ?? 'cards') === 'cards'
      if (!articlesPresent || props.searchArticles === 'no') delete next.articleDisplay
      if (!shopPresent || props.searchProducts === 'no') {
        delete next.productDisplay
        delete next.showPrices
        // The column count is the card grid's, whichever kind of card is in it.
        if (!articleCards) delete next.dropdownColumns
      } else if (!['cards', 'shopCards'].includes(props.productDisplay ?? 'rows') && !articleCards) {
        delete next.dropdownColumns
      }
    }

    const presentation = props.presentation ?? 'field'
    if (presentation !== 'fieldWithButton') delete next.buttonLabel
    // Where the icon's field opens, and how big the glyph is, are only
    // questions for the icon button.
    if (presentation !== 'iconButton') { delete next.iconOpens; delete next.iconSize }
    if (presentation === 'iconButton') {
      delete next.placeholder
      delete next.showIcon
      delete next.widthMode
      delete next.widthPx
      delete next.align
      delete next.autoFocus
    } else if ((props.widthMode ?? 'full') !== 'fixed') {
      delete next.widthPx
      delete next.align
    }

    // Width-when-open is only a question for the anchored overlay - the one
    // arrangement where an in-flow field is replaced by a live one sitting over
    // the top of it. The icon button opens a centred panel or a full-width bar,
    // and an inline or page field never opens at all.
    if (mode !== 'overlay' || presentation === 'iconButton') delete next.openWidth

    return next
  },
  render: SiteSearchBlock,
}
