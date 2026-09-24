import { buildAppleAppSiteAssociation } from '@/lib/auth/ios-webcredentials'

export const dynamic = 'force-static'

export function GET() {
  const body = buildAppleAppSiteAssociation()
  if (!body) {
    return new Response('Not configured', { status: 404 })
  }
  return Response.json(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
