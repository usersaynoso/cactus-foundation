import { NextResponse } from 'next/server'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'
import { listAvailableSources } from '@/modules/search/lib/indexer'
import { syncIndexAlert } from '@/modules/search/lib/alerts'

// Probe used by the Puck blocks' resolveFields to narrow their sidebars to the
// sources this install actually has, and to offer the designed-shop-card
// option only when shop has registered its search.shop-cards provider, and the
// product-filters panel only when some module answers search.product-filters.
// Reveals nothing beyond which modules are installed - the same fact the
// public pages themselves reveal.
export async function GET() {
  const sources = await listAvailableSources()
  // Cheapest early hook for the "index needs building" bell: this endpoint is
  // hit as soon as anyone opens the page-builder panel for a search block.
  await syncIndexAlert()
  const shopCardProvider = Boolean(
    (moduleExtensionPointComponents['search.shop-cards']?.shop as { renderProductCards?: unknown } | undefined)?.renderProductCards,
  )
  const productFilterProvider = Object.values(moduleExtensionPointComponents['search.product-filters'] ?? {}).some(
    (p) => typeof (p as { renderFilteredProductCards?: unknown } | undefined)?.renderFilteredProductCards === 'function',
  )
  return NextResponse.json({
    sources: sources.filter((s) => s.enabled).map((s) => ({ key: s.key, label: s.label })),
    shopCardProvider,
    productFilterProvider,
  })
}

// Which things this site lets people search, which is a setting rather than
// anything about the person asking.
//
// Shared-cache window for this route's answers, applied by the module dispatcher
// (lib/cache/module-api-cache.ts) when the owner has ready-made copies switched
// on and the request carries no session or member cookie.
export const publicCacheTtl = 900
