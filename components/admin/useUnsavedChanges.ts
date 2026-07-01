'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Warns before leaving an admin page while there are unsaved form changes.
 * Covers both hard navigation (reload, tab close, browser back to a non-app
 * page) and in-app link clicks.
 *
 * The page owns `dirtyRef`: flip `dirtyRef.current = true` when a field changes
 * and back to `false` once saved. When an in-app link is clicked with unsaved
 * changes, navigation is intercepted and `pendingHref` is set - render
 * {@link UnsavedChangesModal} with it to prompt the user.
 */
export function useUnsavedChanges() {
  const dirtyRef = useRef(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // Warn on hard navigation (reload, tab close, browser back to a non-app page)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Intercept in-app link navigation while there are unsaved changes
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented) return
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || anchor.target === '_blank') return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      setPendingHref(url.pathname + url.search)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [])

  return { dirtyRef, pendingHref, setPendingHref }
}
