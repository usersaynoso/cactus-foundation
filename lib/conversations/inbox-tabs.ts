import { resolveExtensionTabs, type ExtensionTab } from '@/lib/modules/extension-tabs'
import { getInstalledModules } from '@/lib/modules/live-status'
import {
  conversationConsumerModuleNames,
  conversationProviderModuleNames,
  resolveConversationProviders,
} from '@/lib/conversations/providers'
import type { SessionUser } from '@/lib/auth/session'

/** The id the core All tab answers to in ?tab=. Prefixed because a module is
 *  perfectly entitled to call one of its own tabs "all". */
export const ALL_TAB_ID = 'core-all'

export type ResolvedInboxTabs = {
  /** Module-contributed tabs, suppression already applied. */
  tabs: ExtensionTab[]
  /** Whether core's own All tab belongs in the strip for this user. */
  showAllTab: boolean
}

// Which tabs this user sees on the Inbox page, and whether core adds its own.
//
// Two rules, and the second one is where the sharp edge is:
//
//  - Core shows an All tab when two or more conversation providers resolve.
//    One provider is just that module's own tab with the badges taken off, so
//    it earns nothing; two or more is the first point at which merging helps.
//
//  - A module may declare `consumesConversationProviders`, meaning it presents
//    every channel in one place itself. Then core stands down: no All tab, and
//    no tab for any module that publishes a provider, because those
//    conversations are already on the consumer's screen.
//
// SUPPRESSION IS PER USER. Hiding the contact-form tab for everybody the moment
// a consumer is installed locks out a colleague who has `contact.view` and not
// the consumer's permission - their inbox vanishes with nothing to replace it.
// So the consumer's own tab is resolved FIRST, through the same permission
// filter as every other tab, and if it did not survive for this user then
// nothing is suppressed for this user either.
export async function resolveInboxTabs(user: SessionUser | null): Promise<ResolvedInboxTabs> {
  if (!user) return { tabs: [], showAllTab: false }

  const tabs = await resolveExtensionTabs('core.inbox-tabs', user)
  const modules = await getInstalledModules()

  const consumers = conversationConsumerModuleNames(modules)
  // A consumer this user can actually reach - i.e. one of its tabs survived the
  // permission filter above. No visible consumer, no suppression.
  const consumerIsVisible = tabs.some((tab) => consumers.has(tab.moduleName))
  if (consumerIsVisible) {
    const providerModules = conversationProviderModuleNames(modules)
    return {
      tabs: tabs.filter((tab) => consumers.has(tab.moduleName) || !providerModules.has(tab.moduleName)),
      showAllTab: false,
    }
  }

  const providers = await resolveConversationProviders(user)
  return { tabs, showAllTab: providers.length >= 2 }
}
