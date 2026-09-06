import { prisma } from '@/lib/db/prisma'
import { hasPermission } from '@/lib/permissions/check'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { SessionUser } from '@/lib/auth/session'
import type { Dialler, DiallerNumber, ResolvedDialler } from '@/lib/dialler/types'

// Resolver for `core.dialler`, deliberately shaped like
// lib/conversations/providers.ts: same installed-module gate, same permission
// check, same shrug when a manifest names an entry the generated registry has
// not caught up with yet (a module installed for the first time is live in the
// database a build before its code is in the bundle).
//
// SERVER ONLY. A dialler carries telephony credentials; the manifest entry that
// publishes one must set `serverOnly: true`, which keeps it out of
// lib/modules/extension-points.public.ts.

export const DIALLER_POINT = 'core.dialler'

type ExtensionPointEntry = { point: string; id: string; permission?: string }

// A module could publish anything at all here. Cheap shape check, skip what
// fails it, rather than a stack trace inside somebody's compose window.
function isDialler(value: unknown): value is Dialler {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<Dialler>
  return typeof d.dial === 'function'
    && typeof d.numbers === 'function'
    && typeof d.isConfigured === 'function'
}

/** Every dialler this user is allowed to use, from the modules installed on
 *  this site. Empty for a signed-out caller. Configuration is NOT checked here
 *  - that is a round trip to the provider, and callers who only want to know
 *  whether a seam exists should not pay for it. */
export async function resolveDiallers(user: SessionUser | null): Promise<ResolvedDialler[]> {
  if (!user) return []
  const components = moduleExtensionPointComponents[DIALLER_POINT] ?? {}
  if (Object.keys(components).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  const resolved: ResolvedDialler[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== DIALLER_POINT) continue
      if (entry.permission && !(await hasPermission(user, entry.permission))) continue
      const dialler = components[entry.id]
      if (!isDialler(dialler)) continue
      resolved.push({ moduleName: mod.name, id: entry.id, dialler })
    }
  }
  return resolved
}

/**
 * The one this site dials with, WITHOUT asking whether it is configured.
 *
 * That distinction is the whole reason this exists next to `callerNumbers`.
 * "Is there a dialler at all" is a question about installed modules and answers
 * out of the database; "is it configured" reaches a telephony API over the
 * network. A screen deciding whether to draw a menu entry must ask the cheap
 * one - the expensive one belongs to the screen that opens, where somebody is
 * waiting for an answer anyway.
 */
export async function firstDialler(user: SessionUser | null): Promise<ResolvedDialler | null> {
  return (await resolveDiallers(user))[0] ?? null
}

/**
 * The site's own numbers to call out from, for a caller-ID menu. Empty means
 * there is nothing to place a call with, whether because no module publishes a
 * dialler, because it has no credentials, or because nobody has given it a
 * number - three causes with one answer as far as a screen is concerned.
 *
 * A dialler that throws while being asked is skipped rather than allowed to
 * take the screen down with it, for the same reason lib/auth/sms.ts skips a
 * broken SMS provider: one module's bad afternoon is not the whole site's.
 */
export async function callerNumbers(user: SessionUser | null): Promise<DiallerNumber[]> {
  for (const entry of await resolveDiallers(user)) {
    try {
      const numbers = await entry.dialler.numbers()
      if (numbers.length > 0) return numbers
    } catch {
      continue
    }
  }
  return []
}
