// A stylesheet that appears ONCE on a page however many blocks ask for it.
//
// The problem this solves: a module's blocks carry their own CSS, and the honest
// way to make sure it is present is for every block to emit it. Drop five product
// grids on a page and the same 13 KB stylesheet is written into the markup five
// times; a page with a grid, a search box and a category strip was carrying 183 KB
// of <style>, 68 KB of which was the same bytes over again. The browser then
// parses every copy.
//
// The fix is React's own: a <style> with an `href` and a `precedence` is hoisted
// into <head> and deduplicated by that href, so the second block to ask for the
// same sheet contributes nothing. That is a React 19 feature and it works on both
// sides of the RSC boundary, which matters here - a Puck block renders through the
// editor as a client component and through the site as a server one, and those two
// must produce identical markup.
//
// The href is not a real address and nothing fetches it. It is an identity, so it
// has to be one: two blocks asking for the SAME bytes must agree on it, and two
// asking for different bytes (a grid whose breakpoints differ from its
// neighbour's) must not. Hence the content hash below rather than a hand-written
// name - a name alone would silently serve one block the other's stylesheet.
//
// Ordering: hoisted sheets land in <head>, ahead of anything still inline in the
// body, so a block's own scoped overrides continue to win exactly as they did.
// `precedence` orders the hoisted sheets among themselves; leave it alone unless a
// sheet genuinely has to sit before or after another.

import type { JSX } from 'react'

/**
 * FNV-1a, 32-bit. Not a security hash and never used as one - it exists to turn a
 * stylesheet into a short stable name. Chosen over anything from `crypto` because
 * this runs in the browser as well as on the server, and pulling a hash
 * implementation into every public page to name a <style> tag would cost more than
 * the duplication it saves.
 */
function hashCss(css: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < css.length; i++) {
    h ^= css.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * @param id    A readable name for the sheet, so the markup says what it is -
 *              "shop-cards", "search-box". Two different sheets may share it; the
 *              content hash keeps them apart.
 * @param css   The stylesheet. Emitted verbatim - React treats a <style> element's
 *              text as raw, so selectors carrying `>` and `&` survive intact.
 *              There is a test for exactly that.
 * @param precedence  Ordering group among hoisted sheets. The default suits
 *              anything that only has to beat the defaults and lose to inline
 *              overrides, which is every module stylesheet so far.
 */
export function SharedStyle({
  id,
  css,
  precedence = 'module',
}: {
  id: string
  css: string
  precedence?: string
}): JSX.Element | null {
  if (!css) return null
  return (
    <style href={`${id}-${hashCss(css)}`} precedence={precedence}>
      {css}
    </style>
  )
}
