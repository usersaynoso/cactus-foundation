import { after } from 'next/server'
import { handleOpen, NO_STORE_HEADERS, TRANSPARENT_GIF } from '@/lib/email/tracking/handlers'

// GET /api/email/o/[token] - the invisible picture in an email sent over SMTP
// with the site's own tracking on. Fetching it records an open against the send
// the signed token names, and nothing else. See lib/email/tracking.
//
// Public and unauthenticated: the caller is a stranger's mail program. Always
// answers with the picture, at once, whatever the token says - a broken image
// in a customer's email is a worse outcome than a missed statistic. The open is
// written after the answer has gone.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { record } = handleOpen(token, { header: (name) => request.headers.get(name) })
  if (record) after(record)
  return new Response(new Uint8Array(TRANSPARENT_GIF), {
    status: 200,
    headers: { ...NO_STORE_HEADERS, 'Content-Type': 'image/gif', 'Content-Length': String(TRANSPARENT_GIF.length) },
  })
}
