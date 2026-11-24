import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getMenuEntityProviders } from '@/lib/modules/menu-entity-provider'
import { readHomepageModuleTarget } from '@/lib/homepage/module-target'
import { listHomepageModuleOptions, resolveHomepageModuleTarget } from '@/lib/homepage/module-homepage'

// The module half of Settings > General > Homepage. Pages still come from
// /api/admin/pages; this adds every piece of content a module offers through the
// core.menu-entity-provider extension point (the same providers the menu editor
// uses), and says whether the stored module homepage, if there is one, still
// resolves - so the select can warn, as the menu editor does, when it does not.
export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'config.manage')) return errorResponse('Forbidden', 403)

  const providers = getMenuEntityProviders()
  const [groups, config] = await Promise.all([
    listHomepageModuleOptions(providers),
    prisma.siteConfig.findUnique({
      where: { id: 'singleton' },
      select: { homepageModuleId: true, homepageEntityKind: true, homepageEntityId: true },
    }),
  ])

  const target = readHomepageModuleTarget(config)
  const current = target
    ? {
        ...target,
        moduleLabel: providers[target.moduleId]?.moduleLabel ?? null,
        ...(await resolveHomepageModuleTarget(target, providers)),
      }
    : null

  return NextResponse.json({ groups, current })
}
