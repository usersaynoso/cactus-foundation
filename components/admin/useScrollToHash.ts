'use client'

import { useEffect } from 'react'

/**
 * Scroll the element named by the current URL hash into view, retrying briefly so
 * the jump still lands once async or tab-gated content has mounted. This is what
 * makes the command-palette deep links ("search → jump straight to this setting")
 * actually arrive: the palette navigates to e.g. /config?tab=email#email-test, the
 * page switches to the Email tab, and this hook pulls #email-test into view and
 * briefly flashes it so the eye finds it.
 *
 * Pass whatever state gates when the target becomes present - the active tab, a
 * loading flag - as `deps` so a fresh attempt runs after that content renders. A
 * `hashchange` listener covers same-page jumps (where the hash changes but the deps
 * don't), e.g. hopping between two sections of the tab you're already on.
 */
export function useScrollToHash(deps: unknown[] = []) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    let timer = 0

    function scrollToCurrentHash() {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      let tries = 0
      const attempt = () => {
        if (cancelled) return
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          el.classList.add('admin-search-target-flash')
          window.setTimeout(() => el.classList.remove('admin-search-target-flash'), 1600)
          return
        }
        // The target may belong to a tab that is still mounting - retry for ~2s.
        if (tries++ < 25) timer = window.setTimeout(attempt, 80)
      }
      attempt()
    }

    scrollToCurrentHash()
    // hashchange covers native hash links; the custom event covers same-page jumps
    // fired by the command palette, where Next's pushState updates the hash without
    // emitting hashchange and the page's deps don't change.
    window.addEventListener('hashchange', scrollToCurrentHash)
    window.addEventListener('cactus:scroll-hash', scrollToCurrentHash)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.removeEventListener('hashchange', scrollToCurrentHash)
      window.removeEventListener('cactus:scroll-hash', scrollToCurrentHash)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller passes the gating deps (active tab, loading) explicitly
  }, deps)
}
