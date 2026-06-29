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

  if (!process.env.ENCRYPTION_KEY) {
    return errorResponse(
      'ENCRYPTION_KEY is not set. Add it to your Vercel environment variables to enable GitHub App connections.',
      503
    )
  }

  const keyHex = process.env.ENCRYPTION_KEY
  if (keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
    return errorResponse(
      'ENCRYPTION_KEY must be a 64-character hex string. Generate one with: openssl rand -hex 32',
      503
    )
  }

  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '')
  if (!siteUrl) return errorResponse('SITE_URL is not configured', 503)

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminPath: true, siteName: true },
  })
  if (!config?.adminPath) return errorResponse('Site not configured', 503)

  const { adminPath, siteName } = config
  const state = randomBytes(32).toString('hex')

  const manifest = {
    name: `Cactus Foundation - ${siteName}`,
    url: siteUrl,
    redirect_url: `${siteUrl}/${adminPath}/integrations/github/callback`,
    setup_url: `${siteUrl}/${adminPath}/integrations/github/installed`,
    public: false,
    default_permissions: {
      contents: 'write',
      metadata: 'read',
    },
    default_events: [],
  }

  const res = NextResponse.json({
    formActionUrl: 'https://github.com/settings/apps/new',
    manifest,
    state,
  })

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
