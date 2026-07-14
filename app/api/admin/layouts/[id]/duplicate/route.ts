import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'

type Ctx = { params: Promise<{ id: string }> }

/** Duplicating the same layout twice used to leave two of them called
 * "Header (Copy)", which is no help at all when you are trying to pick the one
 * you just made. Count up instead. */
async function nextCopyName(sourceName: string): Promise<string> {
  const taken = new Set(
    (await prisma.layout.findMany({
      where: { name: { startsWith: `${sourceName} (Copy` } },
      select: { name: true },
    })).map((l) => l.name),
  )

  let name = `${sourceName} (Copy)`
  for (let n = 2; taken.has(name); n++) name = `${sourceName} (Copy ${n})`
  return name
}

// Creates a copy of a layout, so an owner can fork a design they already like
// rather than rebuild it. The copy always starts as a draft with no display
// conditions so it can never displace a live layout by accident.
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const source = await prisma.layout.findUnique({ where: { id } })
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const copy = await prisma.layout.create({
      data: {
        name: await nextCopyName(source.name),
        description: source.description,
        type: source.type,
        builderData: source.builderData ?? undefined,
        status: 'draft',
        displayConditions: { include: [], exclude: [] },
        priority: source.priority,
      },
    })
    return NextResponse.json(copy, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to duplicate layout' }, { status: 500 })
  }
}
