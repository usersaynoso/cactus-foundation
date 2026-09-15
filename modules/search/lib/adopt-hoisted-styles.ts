// The card markup the search dropdown lifts out of /search/cards is only half
// the story. A module stylesheet reaches a page through <SharedStyle>, which
// React hoists out of the markup and into <head> as
// `<style data-href data-precedence>` - so the shop's card sheet is NOT inside
// the `#srch-shop-cards` fragment. A page that already draws product cards has
// that sheet anyway and nobody noticed; a page that does not - checkout, a
// contact page - showed the injected cards with no styling at all.
//
// So copy across whichever hoisted sheets the live page is missing.
function sheetName(href: string): string {
  return href.slice(0, href.lastIndexOf('-'))
}

export function adoptHoistedStyles(doc: Document, target: Document = document): void {
  // Names already on the page, gathered once - and matched in JS rather than
  // with an attribute selector, since a name is only as escapable as whatever
  // an owner called their module.
  const present = new Set(
    Array.from(target.head.querySelectorAll('style[data-href]'))
      .map((el) => sheetName(el.getAttribute('data-href') ?? ''))
      .filter(Boolean),
  )
  for (const el of Array.from(doc.head.querySelectorAll('style[data-href]'))) {
    const href = el.getAttribute('data-href')
    if (!href) continue
    // A data-href is `<name>-<hash of the bytes>`. A sheet already here is
    // skipped on the name, not the exact href: the cards page renders inside
    // the normal site chrome, so its head also carries the header and footer
    // sheets, and a page whose chrome is a variant of them must keep its own
    // rather than have the fetched page's land on top of it. A sheet with no
    // namesake on this page at all - the card stylesheet - is the one worth
    // bringing.
    const name = sheetName(href)
    if (!name || present.has(name)) continue
    present.add(name)
    const style = target.createElement('style')
    style.setAttribute('data-href', href)
    const precedence = el.getAttribute('data-precedence')
    if (precedence) style.setAttribute('data-precedence', precedence)
    style.textContent = el.textContent
    target.head.appendChild(style)
  }
}
