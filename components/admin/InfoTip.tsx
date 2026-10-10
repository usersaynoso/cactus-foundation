'use client'

import type { ReactNode } from 'react'
import { AdminTooltip } from './Tooltip'

// A small (i) beside a field's label that holds the long explanation in the house
// tooltip, so a settings page reads as a list of settings rather than a list of
// essays. Hover or focus shows it; on a touch screen a tap focuses it.
//
// It is a real button so the keyboard can reach it. Clicks are swallowed: it often
// sits inside a <label> that wraps a tick box, and a click on anything in such a
// label would otherwise tick the box.
export function InfoTip({ children, title, label = 'More about this setting' }: {
  children: ReactNode
  title?: string
  label?: string
}) {
  return (
    <AdminTooltip body={children} title={title} className="info-tip" maxWidth={340}>
      <button
        type="button"
        className="info-tip__btn"
        aria-label={label}
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        i
      </button>
    </AdminTooltip>
  )
}
