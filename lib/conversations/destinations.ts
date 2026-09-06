import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import {
  MESSAGE_DESTINATION_POINT,
  type MessageDestination,
  type MessageDestinationGroup,
  type MessageDestinationProvider,
} from '@/lib/conversations/types'

// Resolver for `core.message-destinations` - see lib/conversations/types.ts for
// what the seam is for and why core names neither end of it.
//
// Deliberately the same shape as lib/conversations/providers.ts: the installed
// module gate, the generated registry as the final word on what actually
// exists, a cheap shape check rather than trust, and a shrug when a manifest
// names an entry the bundle has not caught up with - a module installed for the
// first time is live in the database a build before its code is.
//
// SERVER ONLY. Every provider reads its own module's tables.

const MAX_PER_MODULE = 100

type ExtensionPointEntry = { point: string; id: string }

/** A module could publish anything at all here, and a bad one must cost its own
 *  group rather than the whole picker. */
function isDestinationProvider(value: unknown): value is MessageDestinationProvider {
  if (!value || typeof value !== 'object') return false
  const provider = value as Partial<MessageDestinationProvider>
  return typeof provider.list === 'function' && typeof provider.label === 'string'
}

/** One entry as the picker will draw it, or null for a row that is not usable.
 *  An id is what gets stored and handed back months later, so a blank one is
 *  dropped here rather than saved and puzzled over afterwards. */
function usableDestination(value: unknown): MessageDestination | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<MessageDestination>
  if (typeof row.id !== 'string' || row.id.trim() === '') return null
  if (typeof row.label !== 'string' || row.label.trim() === '') return null
  return {
    id: row.id.trim(),
    label: row.label.trim(),
    detail: typeof row.detail === 'string' && row.detail.trim() ? row.detail.trim() : null,
  }
}

/**
 * Every place a message collected on the public side could be delivered to.
 *
 * Empty on a site with no module publishing any, which is the ordinary state of
 * affairs and the reason a collecting module must carry on working with no
 * destination chosen at all.
 */
export async function resolveMessageDestinations(): Promise<MessageDestinationGroup[]> {
  const components = moduleExtensionPointComponents[MESSAGE_DESTINATION_POINT] ?? {}
  if (Object.keys(components).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  const groups: MessageDestinationGroup[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== MESSAGE_DESTINATION_POINT) continue
      const provider = components[entry.id]
      if (!isDestinationProvider(provider)) continue

      let listed: unknown[]
      try {
        listed = await provider.list()
      } catch (err) {
        // One module's tables being unreadable costs that module's group. The
        // form editor behind this is somebody trying to get a page finished.
        console.error(`[core] could not list message destinations from ${mod.name}:`, err)
        continue
      }
      if (!Array.isArray(listed)) continue

      const destinations = listed
        .map(usableDestination)
        .filter((row): row is MessageDestination => row !== null)
        .slice(0, MAX_PER_MODULE)
      if (destinations.length === 0) continue

      groups.push({ moduleName: mod.name, label: provider.label.trim() || mod.name, destinations })
    }
  }
  return groups
}

/** Whether a stored destination id is still one somebody could have chosen.
 *  Asked by a consumer before acting on one, because a mailbox deleted last
 *  month leaves its id sitting in a form nobody has opened since. */
export async function isKnownMessageDestination(destinationId: string): Promise<boolean> {
  const groups = await resolveMessageDestinations()
  return groups.some((group) => group.destinations.some((row) => row.id === destinationId))
}
