import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { runIndex } from '@/modules/search/lib/indexer'
import { syncIndexAlert } from '@/modules/search/lib/alerts'
import { SEARCH_SOURCE_KEYS } from '@/modules/search/lib/types'

const bodySchema = z.object({
  full: z.boolean().default(true),
  sources: z.array(z.enum(SEARCH_SOURCE_KEYS)).optional(),
  cursor: z.object({
    source: z.enum(SEARCH_SOURCE_KEYS),
    offset: z.number().int().min(0),
  }).nullish(),
})

// One bounded batch of (re)indexing. The admin client loops this endpoint with
// the returned cursor until done: true - each call stays inside the module
// route's 60s ceiling.
export async function POST(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'search.manage')) return errorResponse('Forbidden', 403)

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return errorResponse('Invalid request body', 400)

  const result = await runIndex({
    full: parsed.data.full,
    sources: parsed.data.sources,
    cursor: parsed.data.cursor ?? null,
  })
  if (result.done) await syncIndexAlert()
  return NextResponse.json(result)
}
