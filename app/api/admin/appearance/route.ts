import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

export async function GET() {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const config = await prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { designTokens: true },
    })
    return NextResponse.json(config ?? {})
  } catch {
    return NextResponse.json({ error: 'Failed to load appearance' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'appearance.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    // Only accept designTokens; silently ignore legacy headerConfig/footerBuilderData
    if (!('designTokens' in body)) {
      return NextResponse.json({ error: 'designTokens required' }, { status: 400 })
    }

    // Shape guard: allow null (clear) or a v2 token object. Reject anything else
    // rather than persisting a malformed blob.
    const dt = body.designTokens
    if (dt !== null && (typeof dt !== 'object' || Array.isArray(dt) || dt.version !== 2)) {
      return NextResponse.json({ error: 'Invalid designTokens: expected a version 2 object' }, { status: 400 })
    }

    const config = await prisma.siteConfig.update({
      where: { id: 'singleton' },
      data: { designTokens: dt },
    })
    return NextResponse.json(config)
  } catch {
    return NextResponse.json({ error: 'Failed to save appearance' }, { status: 500 })
  }
}
