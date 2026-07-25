import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getSequenceConfig, SequenceConfigSchema } from '@/lib/media/sequence-presets'

// Scroll-sequence conversion presets (Media > Scroll sequences). Reading is gated
// by media.upload - the convert dialog needs the presets to offer them - while
// saving is gated by config.manage, the same key that guards the rest of the
// settings surfaces. Stored as one blob on the SiteConfig singleton; see
// lib/media/sequence-presets.ts.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'media.upload'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const presets = await getSequenceConfig()
  return NextResponse.json({ presets })
}

// Full replace - the settings form always sends both presets in full. Anything
// missing or out of range is rejected rather than silently defaulted, so a saved
// preset is always a preset the worker will accept.
export async function PUT(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'config.manage'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const parsed = SequenceConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid preset settings' }, { status: 400 })
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { sequenceConfig: parsed.data },
  })

  return NextResponse.json({ presets: parsed.data })
}
