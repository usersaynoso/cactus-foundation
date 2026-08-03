'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { takeMemberFlash, type MemberFlash } from '@/lib/members/flash'

// Long enough to read a sentence twice without leaving a stale pill hanging
// over the page for the rest of the visit.
const DISMISS_AFTER_MS = 9000

const GLYPH: Record<MemberFlash['tone'], string> = {
  success: '✓',
  info: 'ℹ',
  error: '⚠',
}

// Shows the one-shot message left by the previous page (see lib/members/flash)
// as a pill floating at the top of the member area. Mounted by the account
// layout on both sides of its sign-in gate, so the pill survives being bounced
// from /{memberAreaPath} to the sign-in page.
export default function AccountFlash() {
  const pathname = usePathname()
  const [flash, setFlash] = useState<MemberFlash | null>(null)

  // Reading (and clearing) happens after render: sessionStorage doesn't exist
  // during the server render, and taking it in an effect keeps the first client
  // render matching the server's empty one. Keyed on the path rather than on
  // mount alone, because this layout is shared by every member-area page: two
  // pages that both render its signed-out branch (verify-email, then login)
  // leave this component sitting in the same slot, so it is never remounted and
  // a mount-only effect would never look again. Only a message actually found
  // replaces what's showing - a re-run finding nothing has nothing to say.
  useEffect(() => {
    const taken = takeMemberFlash()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-navigation hydrate of a one-shot message from session storage; cannot be read during render without a hydration mismatch
    if (taken) setFlash(taken)
  }, [pathname])

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [flash])

  if (!flash) return null

  return (
    <div className="member-flash" role="status" aria-live="polite">
      <div className={`member-flash-pill member-flash-${flash.tone}`}>
        <span aria-hidden="true" className="member-flash-glyph">
          {GLYPH[flash.tone]}
        </span>
        <span className="member-flash-message">{flash.message}</span>
        <button
          type="button"
          className="member-flash-close"
          aria-label="Dismiss this message"
          onClick={() => setFlash(null)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
