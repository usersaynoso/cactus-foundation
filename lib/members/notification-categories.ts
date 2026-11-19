import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleServerExtensionPointComponents } from '@/lib/modules/extension-points.server'
import { getModuleNotificationCategories, type ModuleNotificationCategory } from '@/lib/modules/member-extensions'

// Contract for the "core.member-notification-category-visible" extension point.
//
// A module declares its notification categories as plain manifest data, which
// core lists to every member. That is wrong when the feature behind a category
// is switched off for customers (a planner set to staff-only, say): the member
// is offered a choice about emails from something they cannot see. Core cannot
// know any module's visibility rules, so the module that declared the category
// is asked, and only that module - one module never gets a say over another's.
//
// Registered serverOnly. The handler receives one of its OWN category ids and
// answers false to hide it from the member viewing right now. Anything else
// (true, or no handler at all) keeps today's behaviour: the category shows.
// It runs per request with the member's cookies available, so it may read the
// session to decide.
//
// Kept out of lib/modules/member-extensions.ts on purpose: that file is on the
// proxy's path (route tiers), and this one pulls in the server extension map.
export type MemberNotificationCategoryVisibleHandler = (category: string) => Promise<boolean>

const POINT = 'core.member-notification-category-visible'

type ManifestShape = {
  extensionPoints?: Array<{ point: string; id: string }>
  memberExtensions?: { notificationCategories?: Array<{ category: string }> }
}

/** category id -> the handler of the module that declared it. */
async function handlersByCategory(): Promise<Map<string, MemberNotificationCategoryVisibleHandler>> {
  const out = new Map<string, MemberNotificationCategoryVisibleHandler>()
  const map = moduleServerExtensionPointComponents[POINT] as
    | Record<string, MemberNotificationCategoryVisibleHandler>
    | undefined
  if (!map || Object.keys(map).length === 0) return out

  for (const mod of await getInstalledManifests()) {
    const manifest = mod.manifest as ManifestShape | null
    const entry = manifest?.extensionPoints?.find((e) => e.point === POINT)
    const handler = entry ? map[entry.id] : undefined
    if (!handler) continue
    for (const c of manifest?.memberExtensions?.notificationCategories ?? []) {
      out.set(c.category, handler)
    }
  }
  return out
}

/**
 * The notification categories the member viewing right now should be offered.
 * A handler that throws keeps its category visible - hiding a real choice on an
 * error is worse than showing one too many.
 */
export async function getVisibleModuleNotificationCategories(): Promise<ModuleNotificationCategory[]> {
  const [categories, handlers] = await Promise.all([getModuleNotificationCategories(), handlersByCategory()])
  if (handlers.size === 0) return categories

  const visible = await Promise.all(
    categories.map(async (c) => {
      const handler = handlers.get(c.category)
      if (!handler) return true
      try {
        return (await handler(c.category)) !== false
      } catch (error) {
        console.error('[members] notification category visibility check failed for', c.category, error)
        return true
      }
    }),
  )
  return categories.filter((_, i) => visible[i])
}

/** Whether the Notifications section has anything in it for this member. */
export async function hasVisibleModuleNotificationCategories(): Promise<boolean> {
  return (await getVisibleModuleNotificationCategories()).length > 0
}
