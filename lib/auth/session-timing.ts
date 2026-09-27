// The admin session's clock, in one place. Read by the server (the session row
// and its cookie) and by the admin shell's SessionExpiryWatcher, so the two can
// never disagree about how long an idle session lasts. Deliberately a plain file
// with no directive and no imports: a client component can import a value from
// it, and a server file importing it does not get a 'use client' proxy back.

/**
 * An admin session ends after this long with nobody using it. It is an idle
 * limit, not a lifetime: every touch (see SESSION_TOUCH_EVERY_MS) restarts it.
 */
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Least gap between two touches. Activity inside this window is already
 * covered by the last one, so the admin shell stays quiet until it has passed,
 * and the server declines to rewrite a row it moved this recently. The price is
 * that a session can end up to this much short of a full day after the last
 * click - five minutes in twenty-four hours, which nobody will miss.
 */
export const SESSION_TOUCH_EVERY_MS = 5 * 60 * 1000 // 5 minutes
