// Version history endpoint for Puck builder layouts.
// Requires layouts.manage.
//
// Addressing scheme:
//   index = "live"  → the current published version (publishedData)
//   index = 0..N-1  → a past archived version from the history array (0 = most recent)
//
// GET (no query param)  — lightweight list of all versions, newest first.
// GET ?index=live       — returns the full publishedData blob.
// GET ?index=<n>        — returns history[n].data blob.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'

type HistoryEntry = {
  data: unknown
  title: string
  at: string
  byId: string | null
}

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'layouts.manage')) return errorResponse('Forbidden', 403)

  const { id } = await params
  const layout = await prisma.layout.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      publishedData: true,
      publishedAt: true,
      publishedById: true,
      history: true,
    },
  })
  if (!layout) return errorResponse('Not found', 404)

  const indexParam = request.nextUrl.searchParams.get('index')

  // Fetch a specific version's full data
  if (indexParam !== null) {
    if (indexParam === 'live') {
      if (!layout.publishedData) return errorResponse('No published version exists', 404)
      return NextResponse.json({ data: layout.publishedData })
    }

    const n = parseInt(indexParam, 10)
    if (isNaN(n) || n < 0) return errorResponse('Invalid index', 400)

    const history = Array.isArray(layout.history) ? (layout.history as HistoryEntry[]) : []
    const entry = history[n]
    if (n >= history.length || !entry) return errorResponse('History entry not found', 404)
    return NextResponse.json({ data: entry.data })
  }

  // Return the lightweight list
  const history = Array.isArray(layout.history) ? (layout.history as HistoryEntry[]) : []

  // Collect all user IDs to resolve in one query
  const userIds = new Set<string>()
  if (layout.publishedById) userIds.add(layout.publishedById)
  for (const entry of history) {
    if (entry.byId) userIds.add(entry.byId)
  }

  const users = userIds.size > 0
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, displayName: true, username: true },
      })
    : []

  const nameMap = new Map(users.map((u) => [u.id, u.displayName ?? u.username]))

  const versions = []

  // Current live version (if published)
  if (layout.publishedData) {
    versions.push({
      index: 'live' as const,
      at: layout.publishedAt?.toISOString() ?? null,
      title: layout.name,
      byName: layout.publishedById ? (nameMap.get(layout.publishedById) ?? null) : null,
      isLive: true,
    })
  }

  // Archived versions, newest first (history[0] is most recent archive)
  for (let i = 0; i < history.length; i++) {
    const entry = history[i]
    if (!entry) continue
    versions.push({
      index: i,
      at: entry.at,
      title: entry.title,
      byName: entry.byId ? (nameMap.get(entry.byId) ?? null) : null,
      isLive: false,
    })
  }

  return NextResponse.json({ versions })
}
