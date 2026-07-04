import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// Contract for the "core.menu-entity-provider" extension point: a module
// contributes one provider, keyed by its own module id, so the admin menu
// builder and the public menu resolver (lib/menu/resolve.ts) can offer and
// link to its content without core knowing the module's table names or URL
// scheme. Mirrors the contact-form.thread-messages pattern (a plain async
// function set registered through extensionPoints, not a component).
export type MenuEntityKind = {
  id: string
  label: string
}

export type MenuEntitySearchResult = {
  id: string
  label: string
  hint?: string
}

export type ResolvedMenuEntity = {
  label: string
  href: string
  // false for e.g. a draft post or a members-only board - the admin table still
  // shows it, but lib/menu/resolve.ts drops it from the public-facing menu.
  publiclyVisible: boolean
}

export type MenuEntityProvider = {
  moduleLabel: string
  listKinds: () => MenuEntityKind[]
  searchEntities: (kind: string, query: string) => Promise<MenuEntitySearchResult[]>
  resolveEntity: (kind: string, id: string) => Promise<ResolvedMenuEntity | null>
}

export function getMenuEntityProviders(): Record<string, MenuEntityProvider> {
  return moduleExtensionPointComponents['core.menu-entity-provider'] ?? {}
}

export function getMenuEntityProvider(moduleId: string): MenuEntityProvider | null {
  return getMenuEntityProviders()[moduleId] ?? null
}
