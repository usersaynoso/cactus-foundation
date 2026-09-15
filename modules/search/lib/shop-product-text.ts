// The `search.shop-product-text` extension point: extra words a companion
// module wants a shop product to be findable by.
//
// The shop adapter indexes what shop's own tables hold. It cannot index what
// another module keeps somewhere else, and one thing in particular is worth
// having: shop-variations parks every supplier code on hidden child products
// that never become documents of their own, so a customer searching the code off
// their paperwork found nothing while the listing sat there unfound. A provider
// hands those words back per product id and they go into the parent's body, so
// the parent listing is the hit.
//
// Resolved through the core registry rather than by importing the provider
// module, exactly as lib/query.ts resolves shop.product-card-prices: a static
// cross-module import breaks every build without that module installed.
import { getInstalledManifests } from '@/lib/modules/live-status'

type ShopProductTextProvider = {
  textFor: (productIds: string[]) => Promise<Record<string, string>>
  // Product ids whose extra text changed since a time - the provider's own
  // rows move without the product's `updated_at` moving, so an incremental
  // run would otherwise never revisit them.
  changedSince: (since: Date) => Promise<string[]>
}

const POINT = 'search.shop-product-text'

async function providers(): Promise<ShopProductTextProvider[]> {
  // Dynamic on purpose: a static edge from here to the generated registry
  // closes an import cycle, because the registry imports this module's own
  // contributed components and they reach back to this file. Turbopack can
  // fail a production build on that with "Cannot access 'x' before
  // initialization" while every local check stays green. See
  // scripts/check-import-cycles.mjs.
  const { modulePublicExtensionPointComponents: moduleExtensionPointComponents } =
    await import('@/lib/modules/extension-points.public')
  const registered = (moduleExtensionPointComponents[POINT] ?? {}) as Record<string, ShopProductTextProvider>
  if (Object.keys(registered).length === 0) return []

  const modules = await getInstalledManifests()

  const out: ShopProductTextProvider[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: Array<{ point: string; id: string }> } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== POINT) continue
      const provider = registered[entry.id]
      if (typeof provider?.textFor === 'function' && typeof provider?.changedSince === 'function') out.push(provider)
    }
  }
  return out
}

/** Extra body text per product id, every provider's contributions joined.
 *  A provider that throws contributes nothing rather than emptying the batch:
 *  a document indexed without its codes is a worse search, an indexing run that
 *  dies half way through is a broken one. */
export async function resolveShopProductText(productIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (productIds.length === 0) return out
  for (const provider of await providers()) {
    try {
      for (const [id, text] of Object.entries(await provider.textFor(productIds))) {
        if (!text) continue
        const existing = out.get(id)
        out.set(id, existing ? `${existing} ${text}` : text)
      }
    } catch {
      // See above.
    }
  }
  return out
}

/** Product ids a provider says have changed since the last completed run, for
 *  the incremental pass to pick up alongside shop's own `updated_at` diff. */
export async function resolveShopProductTextChanges(since: Date): Promise<string[]> {
  const out = new Set<string>()
  for (const provider of await providers()) {
    try {
      for (const id of await provider.changedSince(since)) out.add(id)
    } catch {
      // A provider that cannot answer leaves the run exactly as it was before
      // this point existed: shop's own changed rows, and nothing more.
    }
  }
  return [...out]
}
