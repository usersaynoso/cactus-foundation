import { after } from 'next/server'
import { handleClick, NO_STORE_HEADERS } from '@/lib/email/tracking/handlers'

// GET /api/email/c/[token] - a link in an email sent over SMTP with the site's
// own tracking on. Records the click against the send the signed token names,
// then sends the reader on to the address signed into the token. See
// lib/email/tracking.
//
// Never an open redirect: the destination comes only from a token whose
// signature checks out. Anything else - tampered, truncated, not ours - goes to
// the home page instead, never to an error and never anywhere it asked.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { location, record } = handleClick(token, { header: (name) => request.headers.get(name) })
  if (record) after(record)
  return new Response(null, { status: 302, headers: { ...NO_STORE_HEADERS, Location: location } })
}
