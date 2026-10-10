'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Sub-tab state that survives a refresh and can be linked to.
 *
 * Kept in the query string rather than React state alone. The URL is read once
 * on mount (not during render, which would disagree with the server render) and
 * written with replaceState, so the back button leaves the screen instead of
 * walking back through every tab that was poked at. The default tab carries no
 * param.
 */
export function useTabParam<T extends string>(key: string, fallback: T, valid: readonly T[]) {
  const [tab, setTab] = useState<T>(fallback)

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(key)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of the URL's tab on mount
    if (wanted && (valid as readonly string[]).includes(wanted)) setTab(wanted as T)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; the tab list is fixed for the screen
  }, [])

  const selectTab = useCallback(
    (next: T) => {
      setTab(next)
      const url = new URL(window.location.href)
      if (next === fallback) url.searchParams.delete(key)
      else url.searchParams.set(key, next)
      if (url.href !== window.location.href) window.history.replaceState(null, '', url)
    },
    [key, fallback],
  )

  return [tab, selectTab] as const
}
