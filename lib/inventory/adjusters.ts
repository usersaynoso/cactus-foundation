import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

// Contract for the "core.inventory-adjuster" extension point.
//
// Core knows nothing about stock. A shop does, and so would a warehouse module,
// a hire module or a workshop's parts bin - and the things that want to MOVE
// stock (goods arriving on a purchase order, a return going back, a stocktake)
// are frequently in a third module that must not import from the second.
//
// So the capability is named after itself rather than after any of them: a
// module that keeps counts registers one adjuster here, and anything that needs
// a count changed asks core for whatever is registered. Purchase Orders books a
// delivery in without a line of shop-specific code, and does the sensible thing
// on a site with no catalogue at all - which is nothing.
//
// Deliberately a BATCH contract. A delivery is a dozen lines, and a dozen round
// trips to move a dozen counts is a dozen chances for half of them to land.
//
// The provider owns the meaning of every field: what "delta" does to a product
// it does not track, whether a count may go negative, and what else a stock move
// should set off (shop's clears the low-stock reminder and tells the back-in-
// stock subscribers). Core only carries the message.

export type InventoryAdjustment = {
  /** The provider's own product id. Whoever is asking got it from the provider. */
  productId: string
  /** Signed. Positive takes stock in, negative takes it out. */
  delta: number
  /** Machine-readable, for the provider's own history: "purchase-order.receipt". */
  reason: string
  /** Human-readable document this move came off - a GRN number, an order number. */
  ref?: string | null
  /** Who asked, where a person did. */
  userId?: string | null
  /** Anything the provider should file alongside the move. */
  note?: string | null
}

export type InventoryAdjustmentOutcome = {
  productId: string
  /** False where the provider refused or could not find the product. */
  ok: boolean
  /** The count before and after, where the provider keeps one. Null where it
   *  does not track this product at all - which is not a failure. */
  before: number | null
  after: number | null
  /** Plain English, and shown to the person who pressed the button. */
  message?: string
}

export type InventoryAdjuster = {
  /** What to call the provider in a sentence: "Stock was updated in the Shop." */
  label: string
  /**
   * Apply every adjustment, and answer for each one in the order given.
   *
   * MUST NOT throw for an ordinary refusal - an unknown product, an untracked
   * product, a count that would go negative - because the caller has already
   * filed the paperwork that prompted the move and cannot unfile it. Return
   * `ok: false` with a message instead. Throwing is for the database being on
   * fire.
   */
  adjust: (adjustments: InventoryAdjustment[]) => Promise<InventoryAdjustmentOutcome[]>
}

/** Every registered adjuster, keyed by the module id that registered it. */
export function getInventoryAdjusters(): Record<string, InventoryAdjuster> {
  const map = moduleExtensionPointComponents['core.inventory-adjuster'] as
    | Record<string, InventoryAdjuster>
    | undefined
  return map ?? {}
}

/**
 * The one adjuster to use, or null when nothing keeps stock on this site.
 *
 * One, not all: two modules both counting the same product would each apply the
 * same delta, and a delivery of six would put twelve on the shelf. If a site
 * ever genuinely runs two stock systems, that is a decision for the owner to
 * make on a screen, not for core to make by iterating an object.
 */
export function getInventoryAdjuster(): { id: string; adjuster: InventoryAdjuster } | null {
  const entries = Object.entries(getInventoryAdjusters())
  const first = entries[0]
  return first ? { id: first[0], adjuster: first[1] } : null
}

/** Whether anything on this site can move stock at all. */
export function hasInventoryAdjuster(): boolean {
  return Object.keys(getInventoryAdjusters()).length > 0
}
