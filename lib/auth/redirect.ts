// Guards against an open redirect via a `?next=` / `?redirect=` query param.
//
// Only same-origin relative paths are honoured. Anything that could send the
// browser to another host after sign-in - an absolute "scheme://host" URL, or a
// protocol-relative "//host" one - is discarded in favour of the fallback.
// Backslashes are rejected too: some browsers normalise "/\evil.com" into a
// protocol-relative URL.
export function sanitizeRedirect(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (raw.includes('://')) return fallback
  return raw
}
