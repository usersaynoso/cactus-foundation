import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleServerExtensionPointComponents } from '@/lib/modules/extension-points.server'

// Contract for the "core.member-deleted" extension point.
//
// Core deletes members three ways: an admin deleting one (or several at once,
// or rejecting a registration awaiting approval), and the purge cron removing
// accounts whose self-requested grace period has run out. The cascade takes
// core's own child rows with it; a module's rows that only hold the member id
// as text (no foreign key, as the module rules ask) are left pointing at
// nobody. This is the module's moment to tidy up - relabel the member as a
// former member, cancel things they shared - while the Member row still exists.
//
// Registered serverOnly in the module's manifest, no permission (nobody is
// viewing anything - this runs inside the delete request or the cron). Fired
// just BEFORE the row goes, so a handler can still read it. A handler cannot
// stop the deletion: errors are logged and swallowed, and one that has not
// finished within HANDLER_TIMEOUT_MS is left to finish on its own while the
// deletion carries on. Not fired for a member whose deletion is merely
// scheduled - that can still be cancelled - only when it is actually happening.
export type MemberDeletedEvent = {
  memberId: string
  email: string
}

export type MemberDeletedHandler = (member: MemberDeletedEvent) => Promise<void>

const POINT = 'core.member-deleted'
export const HANDLER_TIMEOUT_MS = 10_000

type ExtensionPointEntry = { point: string; id: string }

/** Handlers from modules that are actually installed. The generated map holds
 * every module the build compiled, so the live manifests decide who answers. */
async function handlers(): Promise<MemberDeletedHandler[]> {
  const map = moduleServerExtensionPointComponents[POINT] as Record<string, MemberDeletedHandler> | undefined
  if (!map || Object.keys(map).length === 0) return []

  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const out: MemberDeletedHandler[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      const handler = entry.point === POINT ? map[entry.id] : undefined
      if (handler) out.push(handler)
    }
  }
  return out
}

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`did not finish within ${ms}ms`)), ms)
  })
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Tell modules the members matching `where` are about to be deleted. Call it
 * immediately before the delete, with the same `where` the delete is about to
 * use.
 *
 * Returns the ids it announced, or null when no installed module subscribes -
 * in which case it has not looked anybody up, so a site without a subscriber
 * deletes exactly as it always did. A caller deleting by a condition that can
 * change while the handlers run (the purge cron: somebody can cancel their
 * deletion in the meantime) narrows its delete to the returned ids as well as
 * keeping its own condition, so nobody is deleted unannounced. The reverse can
 * happen - announced, then cancelled in the seconds before the delete - so a
 * handler should tidy up in a way that survives the member still existing.
 *
 * Never throws at its caller. If the lookup itself fails it says so in the log
 * and returns null, and the deletion goes ahead as it would have without it.
 */
export async function notifyMembersDeleting(where: Prisma.MemberWhereInput): Promise<string[] | null> {
  try {
    const list = await handlers()
    if (list.length === 0) return null

    const members = await prisma.member.findMany({ where, select: { id: true, email: true } })
    for (const member of members) {
      const event: MemberDeletedEvent = { memberId: member.id, email: member.email }
      for (const handler of list) {
        await withTimeout(Promise.resolve().then(() => handler(event)), HANDLER_TIMEOUT_MS).catch((error: unknown) => {
          console.error('[members] a module failed on member deleted for', member.id, error)
        })
      }
    }
    return members.map((m) => m.id)
  } catch (error) {
    console.error('[members] could not announce member deletion', error)
    return null
  }
}
