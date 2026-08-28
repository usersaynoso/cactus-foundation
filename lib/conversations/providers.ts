import { prisma } from '@/lib/db/prisma'
import { hasPermission } from '@/lib/permissions/check'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { SessionUser } from '@/lib/auth/session'
import type { ConversationProvider, ResolvedConversationProvider } from '@/lib/conversations/types'

// Resolver for `core.conversation-provider`, deliberately shaped like
// lib/modules/extension-tabs.tsx: same installed-module gate, same permission
// check, same shrug when a manifest names an entry the generated registry has
// not caught up with yet (a module installed for the first time is live in the
// database a build before its code is in the bundle).
//
// SERVER ONLY. A provider reaches a mail server, a chat API or a telephony SDK;
// none of that may end up in a browser bundle. The manifest entry that publishes
// one carries `serverOnly: true`, which keeps it out of
// lib/modules/extension-points.public.ts - see the generator for why the
// directory rule alone was not enough.

export const CONVERSATION_PROVIDER_POINT = 'core.conversation-provider'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

// A module could publish anything at all here - a React component, an object
// missing half its methods - and the failure would land inside the All tab as a
// stack trace rather than at resolution. Cheap shape check, skip what fails it.
function isProvider(value: unknown): value is ConversationProvider {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<ConversationProvider>
  return typeof p.list === 'function' && typeof p.thread === 'function' && typeof p.channel === 'string'
}

/**
 * Every conversation provider this user is allowed to see, from the modules
 * installed on this site. Empty for a signed-out caller.
 */
export async function resolveConversationProviders(
  user: SessionUser | null,
): Promise<ResolvedConversationProvider[]> {
  if (!user) return []
  const components = moduleExtensionPointComponents[CONVERSATION_PROVIDER_POINT] ?? {}
  if (Object.keys(components).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  const resolved: ResolvedConversationProvider[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== CONVERSATION_PROVIDER_POINT) continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      const provider = components[entry.id]
      if (!isProvider(provider)) continue
      resolved.push({ moduleName: mod.name, id: entry.id, provider })
    }
  }
  return resolved
}

/** Module names publishing a provider, whether or not this user may use them.
 *  Suppression asks this question and must not be affected by permissions. */
export function conversationProviderModuleNames(
  modules: { name: string; manifest: unknown }[],
): Set<string> {
  const names = new Set<string>()
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point === CONVERSATION_PROVIDER_POINT) names.add(mod.name)
    }
  }
  return names
}

/** Modules declaring `consumesConversationProviders`. Absent means false, and
 *  that matters: a stored manifest is rewritten from the deployed
 *  cactus.module.json at build time, so a freshly installed module's copy may
 *  not carry the flag yet. Suppression has to fail safe - a missing flag hides
 *  nothing. */
export function conversationConsumerModuleNames(
  modules: { name: string; manifest: unknown }[],
): Set<string> {
  const names = new Set<string>()
  for (const mod of modules) {
    const manifest = mod.manifest as { consumesConversationProviders?: unknown } | null
    if (manifest?.consumesConversationProviders === true) names.add(mod.name)
  }
  return names
}
