import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { getSequenceConfig, resolveFlyFromConfig, SEQUENCE_ENGINES } from '@/lib/media/sequence-presets'

// Scroll-sequence conversion settings (Media > Scroll sequences). Reading is
// gated by media.upload - the convert dialog shows what a conversion will run -
// while saving is gated by config.manage, the same key that guards the rest of
// the settings surfaces. Stored as one blob on the SiteConfig singleton; see
// lib/media/sequence-presets.ts.
//
// The Fly token is a secret: responses only ever say WHERE a token came from
// ('saved' here, 'env' fallback, or null), never the token itself.

async function describeConfig() {
  const config = await getSequenceConfig()
  const { fly, source } = resolveFlyFromConfig(config)
  return {
    settings: config.settings,
    fly: {
      source,
      configured: !!fly,
      appName: fly?.appName ?? null,
    },
  }
}

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'media.upload'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(await describeConfig())
}

// What the settings form may send. The numeric knobs replace in full; the Fly
// token is three-state: absent = leave as it is, '' = clear the saved token
// (fall back to the environment one, if any), a string = save it.
const PutSchema = z.object({
  settings: z.object({
    fps: z.number().int().min(1).max(60),
    maxWidth: z.number().int().min(320).max(3840),
  }),
  fly: z
    .object({
      token: z.string().max(500).optional(),
      appName: z
        .string()
        .regex(/^[a-z0-9-]*$/, 'App names are lower-case letters, digits and hyphens.')
        .max(63)
        .optional(),
    })
    .optional(),
})

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

  const parsed = PutSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })
  }

  const current = await getSequenceConfig()
  const next = {
    settings: {
      engine: SEQUENCE_ENGINES[0],
      fps: parsed.data.settings.fps,
      maxWidth: parsed.data.settings.maxWidth,
    },
    fly: {
      token:
        parsed.data.fly?.token === undefined
          ? current.fly.token
          : parsed.data.fly.token.trim() || null,
      appName:
        parsed.data.fly?.appName === undefined
          ? current.fly.appName
          : parsed.data.fly.appName.trim() || null,
    },
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { sequenceConfig: next },
  })

  return NextResponse.json(await describeConfig())
}
