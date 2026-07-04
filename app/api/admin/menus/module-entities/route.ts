import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getMenuEntityProviders, getMenuEntityProvider } from '@/lib/modules/menu-entity-provider'

// Backs the "Module content" tab of the add-menu-item picker. Two modes:
//  - no moduleId/kind: list every registered module and the entity kinds it offers
//  - moduleId + kind (+ optional q): search that module's entities for the picker
export async function GET(request: NextRequest) {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'menus.manage')) return errorResponse('Forbidden', 403)

  const moduleId = request.nextUrl.searchParams.get('moduleId')
  const kind = request.nextUrl.searchParams.get('kind')
  const q = request.nextUrl.searchParams.get('q') ?? ''

  if (!moduleId || !kind) {
    const providers = getMenuEntityProviders()
    const modules = Object.entries(providers).map(([id, provider]) => ({
      moduleId: id,
      moduleLabel: provider.moduleLabel,
      kinds: provider.listKinds(),
    }))
    return NextResponse.json({ modules })
  }

  const provider = getMenuEntityProvider(moduleId)
  if (!provider) return errorResponse('Unknown module', 400)
  const results = await provider.searchEntities(kind, q)
  return NextResponse.json({ results })
}
