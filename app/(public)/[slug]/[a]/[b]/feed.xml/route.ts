import { dispatchModulePublicRoute } from '@/lib/modules/router'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; a: string; b: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const { slug, a, b } = await ctx.params
  const res = await dispatchModulePublicRoute(slug, [a, b, 'feed.xml'], 'GET', req)
  return res ?? new Response('Not found', { status: 404 })
}
