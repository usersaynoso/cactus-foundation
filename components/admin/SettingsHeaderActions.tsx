'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The Settings page keeps its title, tab strip and Save button in one sticky bar so
// the Save button never scrolls out of reach. Core tabs drive that button directly.
// A module's settings tab owns its own state and its own save call, so it cannot hand
// the page a callback - instead it wraps whatever it wants shown in the bar (a Save
// button, a "Saved" tick, a link) in <SettingsHeaderActions>, and the content is
// portalled into the bar while staying part of the module's own React tree. State,
// handlers and context all keep working; only the position on screen changes.
//
// Outside the Settings page there is no slot, and the content renders where it was
// written, so a panel that is ever reused elsewhere still has a working button.

const SlotElementContext = createContext<HTMLElement | null>(null)
const SetSlotElementContext = createContext<(el: HTMLElement | null) => void>(() => {})

export function SettingsHeaderProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <SetSlotElementContext.Provider value={setSlot}>
      <SlotElementContext.Provider value={slot}>{children}</SlotElementContext.Provider>
    </SetSlotElementContext.Provider>
  )
}

/** Where portalled actions land. Rendered once, inside the sticky Settings bar. */
export function SettingsHeaderSlot() {
  const setSlot = useContext(SetSlotElementContext)
  return <div ref={setSlot} className="settings-header-slot" />
}

/** Shows its children in the Settings bar, top right beside the page title. */
export function SettingsHeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(SlotElementContext)
  if (!slot) return <>{children}</>
  return createPortal(children, slot)
}

/** A short result line for the Settings bar, so a save made from the bar says how it went
 * even when the form's own message is scrolled out of sight. Shows nothing when both
 * are empty; an error wins over a success. */
export function SettingsHeaderStatus({ message, error }: { message?: string | null; error?: string | null }) {
  const text = error || message
  if (!text) return null
  return (
    <span
      role={error ? 'alert' : 'status'}
      title={text}
      style={{
        fontSize: 'var(--text-sm)',
        color: error ? 'var(--color-error)' : 'var(--color-success)',
        maxWidth: error ? '30rem' : '22rem',
        // A success note is a passing remark and can be clipped; an error has to be
        // read in full or it is no use to anyone.
        ...(error ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }),
      }}
    >
      {text}
    </span>
  )
}
