import { getInstalledManifests } from '@/lib/modules/live-status'
import { modulePublicExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.public'

// Whether the account overview shows the "Your details" card
// (`members.contact-details`).
//
// The card exists to fill in somebody else's form: its whole pitch is "filled
// in for you at the checkout", and core has no checkout. On a site with nothing
// installed that reads the name back, the card was a box asking members for
// their full name for no reason anybody could give them. So it is opt-in: a
// module that actually uses the member's name and organisation contributes a
// provider here, and the card only appears when at least one of them says yes.
//
// A provider answers rather than merely existing so that the module can carry a
// switch of its own - a shop that never wants a name on file can say no without
// being uninstalled.

export type MemberContactDetailsProvider = () => boolean | Promise<boolean>

/** True when any installed module wants the member's name (and organisation)
 * on file. A provider that throws counts as a no rather than taking the
 * account page down with it. */
export async function isMemberContactDetailsWanted(): Promise<boolean> {
  const providers = moduleExtensionPointComponents['members.contact-details'] ?? {}
  if (Object.keys(providers).length === 0) return false

  const installed = await getInstalledManifests()

  for (const mod of installed) {
    const manifest = mod.manifest as { extensionPoints?: Array<{ point: string; id: string }> } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== 'members.contact-details') continue
      const provider = providers[entry.id] as MemberContactDetailsProvider | undefined
      if (typeof provider !== 'function') continue
      try {
        if (await provider()) return true
      } catch (error) {
        console.error(`[members] contact details provider "${entry.id}" failed`, error)
      }
    }
  }
  return false
}
