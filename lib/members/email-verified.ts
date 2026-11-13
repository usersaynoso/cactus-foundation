import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleServerExtensionPointComponents } from '@/lib/modules/extension-points.server'

// Contract for the "core.member-email-verified" extension point.
//
// A member's email address becoming verified is the moment a module can start
// trusting it: the shop hands over the guest orders placed at that address, and
// copies the name and company off them onto an account that registered with an
// email and nothing else. Core has no orders and must not learn about them, so
// it says "this address is now proven" and whoever cares gets to act.
//
// Registered serverOnly in the module's manifest, no permission (nobody is
// viewing anything - this runs inside a verification request). Handlers are
// told only what they need and must treat the member as already verified: this
// is fired AFTER the flag is written, never before.
export type MemberEmailVerifiedEvent = {
  memberId: string
  email: string
  marketingConsent: boolean | null
}

export type MemberEmailVerifiedHandler = (member: MemberEmailVerifiedEvent) => Promise<void>

const POINT = 'core.member-email-verified'

type ExtensionPointEntry = { point: string; id: string }

/** Handlers from modules that are actually installed. The generated map holds
 * every module the build compiled, so the live manifests decide who answers. */
async function handlers(): Promise<MemberEmailVerifiedHandler[]> {
  const map = moduleServerExtensionPointComponents[POINT] as Record<string, MemberEmailVerifiedHandler> | undefined
  if (!map || Object.keys(map).length === 0) return []

  const modules = await prisma.module.findMany({ where: { ...INSTALLED_MODULE_WHERE }, select: { manifest: true } })
  const out: MemberEmailVerifiedHandler[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      const handler = entry.point === POINT ? map[entry.id] : undefined
      if (handler) out.push(handler)
    }
  }
  return out
}

/**
 * Tell modules a member's email address has just been verified.
 *
 * Re-reads the member and does nothing unless the address really is verified,
 * so no caller can hand a module an unverified address by mistake. Never throws
 * at its caller: every one of them is in the middle of verifying somebody, and
 * that must not fail because a convenience did.
 */
export async function notifyMemberEmailVerified(memberId: string): Promise<void> {
  try {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, email: true, emailVerified: true, marketingConsent: true },
    })
    if (!member || !member.emailVerified) return

    const event: MemberEmailVerifiedEvent = {
      memberId: member.id,
      email: member.email,
      marketingConsent: member.marketingConsent,
    }
    for (const handler of await handlers()) {
      await handler(event).catch((error: unknown) => {
        console.error('[members] a module failed on member email verified for', memberId, error)
      })
    }
  } catch (error) {
    console.error('[members] could not announce verified email for', memberId, error)
  }
}
