'use client'

import { useEffect } from 'react'

// Client half of the email spam-protection scheme (see lib/email-obfuscate.tsx).
// Mounted once in the public layout. After hydration it walks every protected
// anchor on the page, decodes the address from its data attribute and wires up
// the mailto: href - the address and "mailto:" never appear in the served HTML.
//
// Two kinds of anchor carry data-eml: the ones the text blocks wrap around an
// address they found in the copy, and the owner-typed links (Button, CTA, menu
// items, footer links) whose whole href was a mailto:. Both hydrate the same
// way, so the selector keys off the attribute rather than the text blocks' class.
export default function EmailDeobfuscator() {
  useEffect(() => {
    const wire = (a: HTMLAnchorElement) => {
      const enc = a.getAttribute('data-eml')
      if (!enc) return
      let addr: string
      try {
        addr = atob(enc).split('').reverse().join('')
      } catch {
        return // Leave the entity-encoded text (and the attribute) in place.
      }
      a.setAttribute('href', `mailto:${addr}`)
      a.removeAttribute('data-eml')
    }
    const hydrate = (root: ParentNode) => {
      root.querySelectorAll<HTMLAnchorElement>('a[data-eml]').forEach(wire)
    }
    hydrate(document)
    // Menus mount their dropdown panels and their mobile drawer only once the
    // visitor opens them, long after this first pass - without watching for
    // those, a mailto: menu item would arrive with no href and stay dead. Only
    // childList is observed, so removing data-eml above can't retrigger this.
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.matches('a[data-eml]')) wire(node as HTMLAnchorElement)
          hydrate(node)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return null
}
