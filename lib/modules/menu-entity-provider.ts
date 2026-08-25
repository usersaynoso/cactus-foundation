import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

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
  /**
   * The same answer for a whole set of ids of one kind, keyed by id. Ids the
   * provider has nothing for are simply absent from the map, exactly as
   * `resolveEntity` returns null for them.
   *
   * Optional, and worth implementing. A menu is resolved on every single page
   * render, and every module-entity item in it used to cost its own query -
   * resolved one at a time, each waiting for the last, because the tree walk
   * that drives them is recursive and sequential. On the live install that was
   * seven serial round trips per render before the header could be drawn, and
   * one table alone had been scanned 1.46 million times to answer them.
   *
   * A provider that omits this is not penalised: core falls back to calling
   * `resolveEntity` per id, but concurrently rather than in sequence, so the
   * waiting collapses even where the query count does not.
   */
  resolveEntities?: (kind: string, ids: string[]) => Promise<Map<string, ResolvedMenuEntity>>
}

export function getMenuEntityProviders(): Record<string, MenuEntityProvider> {
  return moduleExtensionPointComponents['core.menu-entity-provider'] ?? {}
}

export function getMenuEntityProvider(moduleId: string): MenuEntityProvider | null {
  return getMenuEntityProviders()[moduleId] ?? null
}
