import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { prisma } from '@/lib/db/prisma'

// Query analytics for the admin dashboard: top queries and zero-result
// queries over the last 30 days, plus recent volume.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'search.view')) return errorResponse('Forbidden', 403)

  const [top, zero, volume] = await Promise.all([
    prisma.$queryRaw<Array<{ normalized: string; searches: bigint; avg_results: number }>>`
      SELECT "normalized", COUNT(*) AS searches, AVG("result_count")::float8 AS avg_results
      FROM "srch_queries"
      WHERE "created_at" > NOW() - INTERVAL '30 days'
      GROUP BY "normalized"
      ORDER BY searches DESC
      LIMIT 20
    `,
    prisma.$queryRaw<Array<{ normalized: string; searches: bigint }>>`
      SELECT "normalized", COUNT(*) AS searches
      FROM "srch_queries"
      WHERE "created_at" > NOW() - INTERVAL '30 days' AND "result_count" = 0
      GROUP BY "normalized"
      ORDER BY searches DESC
      LIMIT 20
    `,
    prisma.$queryRaw<Array<{ day: Date; searches: bigint }>>`
      SELECT date_trunc('day', "created_at") AS day, COUNT(*) AS searches
      FROM "srch_queries"
      WHERE "created_at" > NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day
    `,
  ])

  return NextResponse.json({
    top: top.map((r) => ({ query: r.normalized, searches: Number(r.searches), avgResults: Math.round(r.avg_results * 10) / 10 })),
    zeroResults: zero.map((r) => ({ query: r.normalized, searches: Number(r.searches) })),
    volume: volume.map((r) => ({ day: r.day.toISOString().slice(0, 10), searches: Number(r.searches) })),
  })
}
