import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { isBlocklisted } from '@/lib/config/site'

const Body = z.object({
  adminPath: z.string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Must be lowercase, start and end with alphanumeric, hyphens allowed'),
})

export async function POST(request: NextRequest) {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { setupCompleted: true },
  })
  if (cfg?.setupCompleted) {
    return NextResponse.json({ error: 'Setup is already complete' }, { status: 403 })
  }

  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid admin path' }, { status: 400 })
  }

  const { adminPath } = parsed.data

  if (isBlocklisted(adminPath)) {
    return NextResponse.json({ error: `"${adminPath}" is a reserved path` }, { status: 400 })
  }

  await prisma.siteConfig.upsert({
    where: { id: 'singleton' },
    create: { adminPath },
    update: { adminPath },
  })

  return NextResponse.json({ ok: true })
}
