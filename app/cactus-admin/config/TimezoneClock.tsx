'use client'

import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  const id = setInterval(onChange, 1000)
  return () => clearInterval(id)
}

const currentSecond = () => Math.floor(Date.now() / 1000)

// The server renders on a UTC machine, so it has nothing useful to say about
// the reader's clock. Zero stands for "not in the browser yet" and renders
// nothing, which keeps a ticking clock out of the hydration comparison.
const serverSecond = () => 0

// Shown beside the timezone dropdown so the setting can be checked rather than
// trusted: pick a zone, read the clock, see whether it matches your wrist.
export default function TimezoneClock({ timezone }: { timezone: string }) {
  const second = useSyncExternalStore(subscribe, currentSecond, serverSecond)
  if (second === 0) return null

  let label: string
  try {
    label = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(second * 1000))
  } catch {
    return null
  }

  return (
    <span className="field-hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
      Currently {label}
    </span>
  )
}
