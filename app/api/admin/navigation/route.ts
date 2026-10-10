import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { AdminMenuConfigSchema, parseAdminMenuConfig } from '@/lib/nav/admin-menu'

// Admin sidebar customisation (Settings > General > Admin Menu): per-item order, rename and
// per-role visibility rules, stored as one blob on the SiteConfig singleton. Gated
// by config.manage - the same key that guards the rest of the System settings.

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!(await hasPermission(user, 'config.manage'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminMenuConfig: true },
  })
  return NextResponse.json({ config: config?.adminMenuConfig ?? null })
}

// Full replace - the builder always sends the complete customisation. An empty
// items/sections object is valid and means "back to the built-in defaults".
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

  const parsed = AdminMenuConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid menu configuration' }, { status: 400 })
  }

  // The Settings sidebar switches share this blob but belong to Settings > General >
  // Site, which saves them on its own. The builder never sends them, so carry the
  // stored values across rather than quietly switching the sidebar off.
  const stored = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { adminMenuConfig: true },
  })
  const kept = parseAdminMenuConfig(stored?.adminMenuConfig)
  const next = {
    ...parsed.data,
    settingsSidebar: parsed.data.settingsSidebar ?? kept.settingsSidebar,
    settingsSidebarHideSubTabs: parsed.data.settingsSidebarHideSubTabs ?? kept.settingsSidebarHideSubTabs,
  }

  await prisma.siteConfig.update({
    where: { id: 'singleton' },
    data: { adminMenuConfig: next },
  })

  return NextResponse.json({ config: next })
}
