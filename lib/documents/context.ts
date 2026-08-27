// Handing a document's own data to the blocks that draw it.
//
// A document layout is an ordinary Puck tree, and its part-blocks (the heading,
// the addresses, the line table, the totals) each render one slice of the same
// object. Rather than have every block fetch what it needs - which would be one
// database read per block, all of them for the same row - the page loads the
// document ONCE and attaches it to every part by reference before rendering.
//
// In the Puck editor canvas `_ctx` is undefined and each part draws sample data
// instead: the canvas has no invoice, no quote and no purchase order, and an
// owner dragging blocks around needs to see the shape of the thing they are
// designing.
//
// Lifted out of the shop module, where the same twenty lines were written twice
// (invoice-doc-context.ts and quote-for-shop's doc-context.ts) and would have
// been written a third time by the first module to print anything else.

/** The one field every document context carries, whatever the document is. */
export type DocumentContext = {
  /** True while rendering for the PDF. Parts use it to drop anything that only
   *  makes sense on screen - there is nothing to click in a PDF. */
  print: boolean
}

/** The shape of a saved Puck layout, as far as this file needs to know. */
export type PuckLikeData = { content?: unknown; zones?: Record<string, unknown>; root?: unknown }

function attach(blocks: unknown[], ctx: unknown, partTypes: ReadonlySet<string>): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && block.props && partTypes.has(block.type)) {
      block.props._ctx = ctx
    }
    if (block.props) {
      for (const [key, value] of Object.entries(block.props)) {
        // Recurse into nested slot arrays (Split/Section zones), but never into
        // the context just attached.
        if (key !== '_ctx' && Array.isArray(value)) attach(value, ctx, partTypes)
      }
    }
  }
}

/**
 * Clones the saved layout (pure JSON) and attaches the context by reference, so
 * one object is shared by every part rather than serialised per block.
 *
 * `partTypes` is the caller's list of blocks that actually read the document. A
 * style block and a divider are deliberately left off every such list: neither
 * prints a figure, so neither needs the document, and attaching it to them would
 * only make the injected tree bigger.
 */
export function injectDocumentContext<T extends PuckLikeData>(
  data: T,
  ctx: unknown,
  partTypes: Iterable<string>,
): T {
  const types = partTypes instanceof Set ? (partTypes as ReadonlySet<string>) : new Set(partTypes)
  const cloned = JSON.parse(JSON.stringify(data)) as T
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  attach([...content, ...zoneBlocks], ctx, types)
  return cloned
}
