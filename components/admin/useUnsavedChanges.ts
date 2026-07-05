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
 *
 * Pass `extraIsDirty` when a second, independently-tracked form on the same page
 * can also be dirty (e.g. the Branding tab on the Styles page, which saves to its
 * own endpoint): the guard fires when either `dirtyRef` or `extraIsDirty()` is set.
 */
export function useUnsavedChanges(extraIsDirty?: () => boolean) {
  const dirtyRef = useRef(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  // Keep the latest predicate in a ref so the once-bound listeners always read
  // the current value without re-registering. Written in an effect, not during
  // render, so a ref is never mutated mid-render.
  const extraIsDirtyRef = useRef(extraIsDirty)
  useEffect(() => { extraIsDirtyRef.current = extraIsDirty })

  // Warn on hard navigation (reload, tab close, browser back to a non-app page)
  useEffect(() => {
    const isDirty = () => dirtyRef.current || (extraIsDirtyRef.current?.() ?? false)
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Intercept in-app link navigation while there are unsaved changes
  useEffect(() => {
    const isDirty = () => dirtyRef.current || (extraIsDirtyRef.current?.() ?? false)
    const handler = (e: MouseEvent) => {
      if (!isDirty() || e.defaultPrevented) return
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
