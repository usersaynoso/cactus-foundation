import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { ensureLayoutsCurrent } from '@/lib/setup/starterLayouts'
import { isInstalledLayoutType } from '@/lib/layout/installed-layout-types'
import { defaultConditionsForLayout } from '@/lib/layout/displayConditions'

// The list never needs `publishedData` or `history` - the latter is up to ten
// whole Puck payloads per layout, and a bare findMany was shipping every one of
// them to the browser just to draw a card with a name and a thumbnail on it.
const LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  description: true,
  status: true,
  builderData: true,
  displayConditions: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function GET(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Admin-only sites still get the post-update prune even if the public site
    // hasn't been visited since the deploy.
    await ensureLayoutsCurrent()

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const layouts = await prisma.layout.findMany({
      where: type ? { type } : undefined,
      select: LIST_SELECT,
      // Published first (Postgres orders the enum draft < published), then the
      // one you touched most recently. Oldest-created-first buried the layout
      // you were just working on at the bottom of the list.
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    })
    return NextResponse.json({ layouts })
  } catch {
    return NextResponse.json({ error: 'Failed to load layouts' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionFromCookie()
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const ok = await hasPermission(user, 'layouts.manage')
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, description, type, builderData, displayConditions } = await req.json()
    if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    // Installed, not merely known: every build clones every module in modules.json,
    // so the code for a Shop layout is present on sites that have no Shop. The tabs
    // no longer offer those types; this is what stops one being posted anyway.
    const layoutType: string = type ?? 'infoPage'
    if (!await isInstalledLayoutType(layoutType)) {
      return NextResponse.json({ error: 'Unknown layout type' }, { status: 400 })
    }

    const layout = await prisma.layout.create({
      data: {
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() || null : null,
        type: layoutType,
        builderData: builderData ?? null,
        // A 404 layout shows on 404s and a module layout is picked by its type
        // alone, so those start with the only rule they could ever carry rather
        // than bouncing the owner with "add a display condition" on first save.
        displayConditions: displayConditions ?? defaultConditionsForLayout(layoutType) ?? undefined,
      },
    })
    return NextResponse.json(layout, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create layout' }, { status: 500 })
  }
}
