// Serialise a JSON-LD object for a <script type="application/ld+json"> tag.
//
// `<` is escaped, not merely `</`: the parser ends a script element at the
// first `</` it sees, so a value carrying markup - a product description with a
// supplier's embed in it, an address with a stray tag - would close the script
// early and leave the remainder of the JSON on the page as broken markup, which
// takes React's hydration of the whole route down with it.
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
