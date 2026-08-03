// A one-shot message handed from one member-area page to the next across a
// navigation, shown as a pill at the top of whatever page the visitor lands on.
//
// sessionStorage rather than a query string, because the account area's gate
// gets in the way: a signed-out visitor sent to /{memberAreaPath} is bounced to
// /login with the whole original URL folded into ?redirect=, so a flag on the
// URL would arrive buried inside another parameter rather than somewhere a page
// can read it. It is also read once and cleared, so a refresh doesn't replay a
// message about something that happened a screen ago.

export type MemberFlashTone = 'success' | 'info' | 'error'

export type MemberFlash = { message: string; tone: MemberFlashTone }

const KEY = 'cactus:member-flash'

const TONES: MemberFlashTone[] = ['success', 'info', 'error']

// Storage throws rather than no-ops in a few real setups (Safari private
// browsing, cookies blocked entirely). A missed pill is not worth an error
// boundary, so every access swallows its own failure.
export function setMemberFlash(message: string, tone: MemberFlashTone = 'success'): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ message, tone } satisfies MemberFlash))
  } catch {
    // No session storage available - the destination page simply shows no pill.
  }
}

export function takeMemberFlash(): MemberFlash | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(KEY)
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { message, tone } = parsed as { message?: unknown; tone?: unknown }
    // The value is put here by this site's own code, but it is still text from
    // a store a page script can write to, so it is checked before it is shown.
    if (typeof message !== 'string' || message.trim() === '') return null
    return {
      message: message.slice(0, 300),
      tone: TONES.includes(tone as MemberFlashTone) ? (tone as MemberFlashTone) : 'success',
    }
  } catch {
    return null
  }
}
