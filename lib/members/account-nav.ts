import { getInstalledManifests } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'

// Tabs modules add to the member account nav (`members.account-nav`).
//
// `members.account-section` already lets a module drop a card onto the account
// overview, but a card is not a home: Shop's order history sat behind two text
// links on the overview and its own pages rendered outside the account area
// entirely, with no tabs and no way back. This point gives a module a tab of
// its own beside Profile and Security, and MemberAccountShell gives the pages
// it points at the same chrome, so a member never falls out of their account
// halfway through looking at an order.
//
// The href is a full public path, not a sub-path of the member area: the pages
// belong to the module and live under the module's own routes.

export type MemberAccountNavItem = {
  /** Unique within the contributing module. Used as the React key. */
  key: string
  label: string
  /** Full public path, e.g. "/shop/account/orders". */
  href: string
  /** Small count pill, for things waiting on the member. Falsy hides it. */
  badge?: number
  /** The module's own `members.account-section` id that draws this tab's content
   *  in full. Set it and the tab joins the one-page account: with
   *  `accountSinglePage` on, the tab scrolls to that section instead of loading
   *  `href`, exactly as a core section's tab does. Leave it off and the tab stays
   *  a page in both shapes, which is the right answer for anything too big or
   *  too stateful to unroll under somebody's passkeys.
   *
   *  The page at `href` carries on existing either way - it is what a bookmark,
   *  an email link and anybody with JavaScript off still lands on. */
  sectionId?: string
}

/** The slice of the member a provider gets. Deliberately narrow - a module has
 * no business with the rest of the record, and this is the same shape the shop
 * already needs to find a member's orders. */
export type MemberAccountNavContext = {
  id: string
  email: string
  emailVerified: boolean
}

export type MemberAccountNavProvider = (
  member: MemberAccountNavContext,
) => MemberAccountNavItem[] | Promise<MemberAccountNavItem[]>

/** Every tab contributed by an installed module, in manifest order.
 *
 * A provider that throws is dropped rather than taking the account area down
 * with it - a module having a bad day must not lock a member out of their own
 * security settings. */
export async function getMemberAccountNavExtras(
  member: MemberAccountNavContext,
): Promise<MemberAccountNavItem[]> {
  const providers = moduleExtensionPointComponents['members.account-nav'] ?? {}
  if (Object.keys(providers).length === 0) return []

  const installed = await getInstalledManifests()

  const ids: string[] = []
  for (const mod of installed) {
    const manifest = mod.manifest as { extensionPoints?: Array<{ point: string; id: string }> } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point === 'members.account-nav') ids.push(entry.id)
    }
  }

  const items: MemberAccountNavItem[] = []
  for (const id of ids) {
    const provider = providers[id] as MemberAccountNavProvider | undefined
    if (typeof provider !== 'function') continue
    try {
      const contributed = await provider(member)
      if (Array.isArray(contributed)) items.push(...contributed)
    } catch (error) {
      console.error(`[members] account nav provider "${id}" failed`, error)
    }
  }
  return items
}
