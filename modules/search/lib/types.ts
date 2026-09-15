export type PuckData = { root?: unknown; content?: unknown[]; zones?: Record<string, unknown[]> }

export const SEARCH_SOURCE_KEYS = [
  'page',
  'shop-product',
  'shop-category',
  'shop-collection',
  'gazette-post',
  'directory-entry',
  'boards-thread',
  'member',
] as const

export type SearchSourceKey = (typeof SEARCH_SOURCE_KEYS)[number]

export function isSearchSourceKey(value: string): value is SearchSourceKey {
  return (SEARCH_SOURCE_KEYS as readonly string[]).includes(value)
}

// Badge label shown on result rows/cards per source.
export const SOURCE_LABELS: Record<SearchSourceKey, string> = {
  'page': 'Page',
  'shop-product': 'Product',
  'shop-category': 'Category',
  'shop-collection': 'Collection',
  'gazette-post': 'Article',
  'directory-entry': 'Directory',
  'boards-thread': 'Forum',
  'member': 'Member',
}

export type SearchTier = 'public' | 'members'

// One entity as handed from an adapter to the indexer.
export type SearchDocument = {
  source: SearchSourceKey
  entityId: string
  title: string
  excerpt: string | null
  body: string
  url: string
  imageUrl: string | null
  extra: Record<string, unknown> | null
  tier: SearchTier
  sourceUpdatedAt: Date | null
}

export type SearchSettings = {
  id: string
  language: string
  sources: Partial<Record<SearchSourceKey, boolean>>
  weights: Partial<Record<SearchSourceKey, number>>
  queryLogging: boolean
  logRetentionDays: number
  excerptLength: number
  lastIndexAt: Date | null
  updatedAt: Date
}

// One hit as returned by lib/query.ts. `snippet` carries « » markers around
// matched words (see SNIPPET_START/SNIPPET_END) - renderers escape the text and
// swap the markers for <mark>, never trusting the string as HTML.
export type SearchHit = {
  source: SearchSourceKey
  entityId: string
  title: string
  url: string
  imageUrl: string | null
  excerpt: string | null
  snippet: string | null
  extra: Record<string, unknown> | null
  date: string | null
  // `from` marks a genuine price range (a product whose variations differ in
  // price): the renderer prefixes "From" and `now` is the cheapest variation.
  price: { now: string; was: string | null; symbol: string; from?: boolean } | null
  rank: number
}

export const SNIPPET_START = '«'
export const SNIPPET_END = '»'

// Postgres ships these text-search configurations by default; the language
// setting is constrained to this list so it can be safely cast to regconfig.
// Lives here (not lib/settings.ts) because the admin settings tab is a client
// component and must not transitively reach lib/db/prisma.
export const ALLOWED_LANGUAGES = [
  'simple', 'danish', 'dutch', 'english', 'finnish', 'french', 'german',
  'hungarian', 'italian', 'norwegian', 'portuguese', 'romanian', 'russian',
  'spanish', 'swedish', 'turkish',
] as const

export function isAllowedLanguage(value: string): boolean {
  return (ALLOWED_LANGUAGES as readonly string[]).includes(value)
}
