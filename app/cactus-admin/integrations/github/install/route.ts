import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { prisma } from '@/lib/db/prisma'
import { errorResponse } from '@/lib/utils'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const conn = await prisma.githubAppConnection.findFirst()
  if (!conn) return errorResponse('No GitHub App connection found. Start the connect flow first.', 404)

  const state = randomBytes(32).toString('hex')
  const installUrl = `https://github.com/apps/${conn.appSlug}/installations/new?state=${state}`

  const res = NextResponse.json({ installUrl })

  const isProduction = process.env.NODE_ENV === 'production'
  res.cookies.set('cactus_github_app_state', state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return res
}
