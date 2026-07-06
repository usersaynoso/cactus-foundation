'use client'

import { useEffect, useState } from 'react'

export type ColourSlot = { id: string; name: string; light: string; dark: string }

// Module-level cache so every colour-swatch field (potentially several per
// block, remounted whenever Puck re-renders its Fields panel) shares one
// fetch instead of each racing its own request and flashing back to an empty
// swatch row while it reloads.
let cache: ColourSlot[] | null = null
let inFlight: Promise<ColourSlot[]> | null = null

function fetchColours(): Promise<ColourSlot[]> {
  if (cache) return Promise.resolve(cache)
  if (!inFlight) {
    inFlight = fetch('/api/admin/appearance')
      .then(r => r.json())
      .then((d): ColourSlot[] => d.designTokens?.designSystem?.colours ?? [])
      .catch((): ColourSlot[] => [])
      .then(colours => { cache = colours; return colours })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

export function useSiteColours(): ColourSlot[] {
  const [colours, setColours] = useState<ColourSlot[]>(cache ?? [])

  useEffect(() => {
    if (cache) return
    let cancelled = false
    fetchColours().then(c => { if (!cancelled) setColours(c) })
    return () => { cancelled = true }
  }, [])

  return colours
}
