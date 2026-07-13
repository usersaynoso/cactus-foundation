'use client'

import { useEffect } from 'react'

// Client half of the email spam-protection scheme (see lib/email-obfuscate.tsx).
// Mounted once in the public layout. After hydration it walks every protected
// anchor on the page, decodes the address from its data attribute and wires up
// the mailto: href - the address and "mailto:" never appear in the served HTML.
export default function EmailDeobfuscator() {
  useEffect(() => {
    const hydrate = () => {
      document.querySelectorAll<HTMLAnchorElement>('a.cactus-eml[data-eml]').forEach((a) => {
        const enc = a.getAttribute('data-eml')
        if (!enc) return
        try {
          const addr = atob(enc).split('').reverse().join('')
          a.setAttribute('href', `mailto:${addr}`)
        } catch {
          // Leave the entity-encoded text in place if decoding fails.
        }
        a.removeAttribute('data-eml')
      })
    }
    hydrate()
  }, [])
  return null
}
