import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSearchSettings, updateSearchSettings, ALLOWED_LANGUAGES } from '@/modules/search/lib/settings'
import { SEARCH_SOURCE_KEYS } from '@/modules/search/lib/types'

const sourceKeyEnum = z.enum(SEARCH_SOURCE_KEYS)

const updateSchema = z.object({
  language: z.enum(ALLOWED_LANGUAGES).optional(),
  sources: z.record(sourceKeyEnum, z.boolean()).optional(),
  weights: z.record(sourceKeyEnum, z.number().min(0.1).max(10)).optional(),
  queryLogging: z.boolean().optional(),
  logRetentionDays: z.number().int().min(1).max(3650).optional(),
  excerptLength: z.number().int().min(60).max(600).optional(),
})

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'search.manage')) return errorResponse('Forbidden', 403)
  return NextResponse.json(await getSearchSettings())
}

export async function PUT(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'search.manage')) return errorResponse('Forbidden', 403)

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return errorResponse('Invalid settings', 400)

  return NextResponse.json(await updateSearchSettings(parsed.data))
}
