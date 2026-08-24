import { NextResponse } from 'next/server'
import { readWellKnownFile } from '@/lib/well-known/providers'

// Everything under /.well-known/ that no static file already answers.
// next.config.ts rewrites the path here (afterFiles, deliberately: a real file
// in /public/.well-known still wins, so this only ever fills a gap).
//
// Core serves the path and nothing else - what lives at it comes from whichever
// module registered a provider on 'core.well-known-files'. See
// lib/well-known/providers.ts for why the path cannot live under the module's
// own /api/m/… routes.
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const contents = await readWellKnownFile(path.join('/'))
  // Not found is the ordinary answer here, not a fault: the verifying party
  // asked for a file this site has not been given.
  if (contents === null) return new NextResponse('Not found', { status: 404 })

  // text/plain, always. Every verification file any provider asks for is a
  // token or a small JSON blob read by a machine, and serving one as
  // text/html would let a pasted-in file run script on this origin.
  return new NextResponse(contents, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      // Short: an owner who has just pasted the file in wants the verifying
      // party to see it now, and this is fetched once in a blue moon.
      'Cache-Control': 'public, max-age=300',
    },
  })
}
