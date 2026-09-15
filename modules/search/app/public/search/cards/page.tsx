import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { connection } from 'next/server'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

// HTML source for the dropdown's designed product cards. The live search island
// (SearchBoxClient) fetches this page and lifts the `#srch-shop-cards` fragment
// into the dropdown - the only way the shop's Puck-designed Product Card
// template (server-stamped via the search.shop-cards extension point, exactly
// as the results block and the shop grids stamp it) can reach a client-side
// typeahead. The page renders inside the normal public chrome; the client
// discards everything outside the fragment wrapper.
//
// Injected markup never hydrates, so the provider is asked for still media -
// one image per card, no overlay controls - rather than carousels with dead
// arrows (shop <= 0.1.161 ignores the option and simply renders interactive
// markup whose controls do nothing).

type ShopCardsProvider = {
  renderProductCards?: (productIds: string[], opts?: { columns?: number; media?: 'interactive' | 'still' }) => Promise<ReactNode | null>
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export const metadata: Metadata = {
  title: 'Search cards',
  robots: { index: false, follow: false },
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export default async function SearchCardsPage({ searchParams }: Props) {
  await connection()
  const sp = await searchParams
  // Ids come straight from the query result the client just received; the
  // provider re-checks each one is a publicly listable ACTIVE product, so a
  // hand-typed id reveals nothing the shop pages don't.
  const ids = first(sp.ids).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 24)
  const columns = parseInt(first(sp.cols) || '4', 10) || 4

  const provider = (moduleExtensionPointComponents['search.shop-cards']?.shop ?? null) as ShopCardsProvider | null
  let cards: ReactNode = null
  if (ids.length > 0 && provider?.renderProductCards) {
    cards = await provider.renderProductCards(ids, { columns, media: 'still' }).catch(() => null)
  }

  // The wrapper is always present so the client can tell "page worked, nothing
  // to show" (empty fragment - fall back) from a failed fetch.
  return <div id="srch-shop-cards">{cards}</div>
}
