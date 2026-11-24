import { getMenuEntityProviders, type MenuEntityProvider } from '@/lib/modules/menu-entity-provider'
import { safeHomepageHref, type HomepageModuleTarget } from './module-target'

// The half of the module homepage that asks a module. Providers come from the
// core.menu-entity-provider extension point, read through the PUBLIC extension
// map (lib/modules/menu-entity-provider.ts), because the root route is a public
// page and must never pull in module admin screens.
//
// Every provider call is caught. The root URL is the one address every visitor
// and crawler starts from, so a module having a bad day costs it the redirect,
// never the page.

export type HomepageModuleResolution =
  | { ok: true; href: string; label: string }
  | { ok: false; reason: 'no-provider' | 'not-found' | 'not-public' | 'unsafe-href' | 'error'; label?: string }

type Providers = Record<string, MenuEntityProvider>

export async function resolveHomepageModuleTarget(
  target: HomepageModuleTarget,
  providers: Providers = getMenuEntityProviders(),
): Promise<HomepageModuleResolution> {
  const provider = providers[target.moduleId]
  if (!provider) return { ok: false, reason: 'no-provider' }
  let resolved
  try {
    resolved = await provider.resolveEntity(target.kind, target.entityId)
  } catch {
    return { ok: false, reason: 'error' }
  }
  if (!resolved) return { ok: false, reason: 'not-found' }
  // The same rule the public menu applies: a draft post or a members-only board
  // is not something to send every visitor to.
  if (!resolved.publiclyVisible) return { ok: false, reason: 'not-public', label: resolved.label }
  const href = safeHomepageHref(resolved.href)
  if (!href) return { ok: false, reason: 'unsafe-href', label: resolved.label }
  return { ok: true, href, label: resolved.label }
}

export type HomepageOptionGroup = {
  moduleId: string
  moduleLabel: string
  kind: string
  kindLabel: string
  entries: Array<{ id: string; label: string; hint?: string }>
}

/** Most a single kind contributes to the Homepage select. */
export const HOMEPAGE_OPTIONS_PER_KIND = 200

/**
 * Every piece of module content the Homepage select can offer, one group per
 * (module, kind), from each provider's answer to an empty search - what the menu
 * editor's picker shows before anything is typed. Kinds with nothing to offer,
 * and providers that throw, are left out.
 */
export async function listHomepageModuleOptions(providers: Providers = getMenuEntityProviders()): Promise<HomepageOptionGroup[]> {
  const perProvider = await Promise.all(Object.entries(providers).map(async ([moduleId, provider]) => {
    let kinds
    try {
      kinds = provider.listKinds()
    } catch {
      return []
    }
    const groups = await Promise.all(kinds.map(async (kind): Promise<HomepageOptionGroup | null> => {
      try {
        const results = await provider.searchEntities(kind.id, '')
        if (results.length === 0) return null
        return {
          moduleId,
          moduleLabel: provider.moduleLabel,
          kind: kind.id,
          kindLabel: kind.label,
          entries: results.slice(0, HOMEPAGE_OPTIONS_PER_KIND).map((r) => ({
            id: r.id,
            label: r.label,
            ...(r.hint ? { hint: r.hint } : {}),
          })),
        }
      } catch {
        return null
      }
    }))
    return groups.filter((g): g is HomepageOptionGroup => g !== null)
  }))
  return perProvider.flat().sort((a, b) =>
    a.moduleLabel.localeCompare(b.moduleLabel) || a.kindLabel.localeCompare(b.kindLabel))
}
