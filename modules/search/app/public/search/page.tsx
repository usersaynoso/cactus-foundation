import type { Metadata } from 'next'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { injectSearchContext } from '@/modules/search/lib/inject-search-context'
import type { PuckData } from '@/modules/search/lib/types'
import { SiteSearchBlockRsc } from '@/modules/search/components/puck/SiteSearchBlock.rsc'
import { siteSearchPuckComponent } from '@/modules/search/components/puck/SiteSearchBlock'
import { SiteSearchResultsBlockRsc } from '@/modules/search/components/puck/SiteSearchResultsBlock.rsc'
import { siteSearchResultsPuckComponent } from '@/modules/search/components/puck/SiteSearchResultsBlock'
import { CactusRender } from '@/lib/puck/CactusRender'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export async function generateMetadata({ searchParams }: Partial<Props>): Promise<Metadata> {
  // Cores before 0.5.832 invoke module generateMetadata without searchParams -
  // fall back to a plain title rather than throwing the whole page over.
  const sp = (await searchParams) ?? {}
  const q = first(sp.q).trim()
  return {
    title: q ? `Search: ${q}` : 'Search',
    robots: { index: false, follow: false },
  }
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const ctx = {
    searchQuery: first(sp.q).trim().slice(0, 200),
    searchPageNum: Math.max(1, parseInt(first(sp.page) || '1', 10) || 1),
    searchSort: first(sp.sort) === 'newest' ? 'newest' : 'relevance',
    searchSourcesParam: first(sp.sources).slice(0, 300),
  }

  const layout = await resolveThemeLayout('searchResults', { moduleName: 'search' })
  if (layout?.builderData) {
    const data = injectSearchContext(layout.builderData as PuckData, ctx)
    return <CactusRender config={getModuleLayoutPuckRscConfig('searchResults') as any} data={data as any} />
  }

  // No published layout yet: render the starter arrangement directly so the
  // page works out of the box.
  const boxProps = { ...siteSearchPuckComponent.defaultProps, mode: 'page', presentation: 'fieldWithButton', size: 'large', ...ctx }
  const resultsProps = { ...siteSearchResultsPuckComponent.defaultProps, ...ctx }
  // Designed shop cards sit in a multi-column grid, so the reading column that
  // suits a list of text results squashes them. Match the shop's own pages when
  // that is what this page will render.
  const shopCards = resultsProps.productCardStyle === 'shopCard' && Boolean(
    (moduleExtensionPointComponents['search.shop-cards']?.shop as { renderProductCards?: unknown } | undefined)?.renderProductCards,
  )
  return (
    // Vertical spacing only: the two blocks carry their own left/right gutter
    // (searchBoxPaddingClasses / searchResultsPaddingClasses), so putting one
    // here as well would pad the page twice over.
    <div style={{ maxWidth: shopCards ? 1200 : 860, margin: '0 auto', padding: '2rem 0' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <SiteSearchBlockRsc {...boxProps} />
      </div>
      <SiteSearchResultsBlockRsc {...resultsProps} />
    </div>
  )
}
