import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { EmailSender, EmailTransport } from '@/lib/email'

// ---------------------------------------------------------------------------
// Who a module's automatic emails go out as.
//
// Core's own answer is "the site's address, from Settings > Emails", and for
// most sites that is the whole story. A site that answers on more than one
// address, though, has a real question to settle: an order confirmation that
// goes out as the site's catch-all, and is then replied to, lands wherever that
// catch-all lands rather than with the people who deal with orders.
//
// So a module may publish an identity provider at this point and say, for a
// given module's mail, which address it should leave as. Core knows nothing
// about what that provider consults - a mailbox, a config row, a coin - only
// that it either names a sender or does not.
//
// Costs nothing on a site with no provider installed: the generated registry is
// empty, and this returns before it reaches the database.
// ---------------------------------------------------------------------------

export const OUTBOUND_EMAIL_IDENTITY_POINT = 'core.outbound-email-identity'

/** What a provider may decide for one module's mail. `from` is the point of it;
 *  the other two are for a sender whose address is answered somewhere the site's
 *  own account cannot send as. */
export type OutboundEmailIdentity = {
  from: EmailSender
  replyTo?: string
  transport?: EmailTransport
}

export type OutboundEmailIdentityProvider = {
  identityFor(moduleName: string): Promise<OutboundEmailIdentity | null>
}

function isProvider(value: unknown): value is OutboundEmailIdentityProvider {
  return !!value && typeof value === 'object' && typeof (value as OutboundEmailIdentityProvider).identityFor === 'function'
}

type ExtensionPointEntry = { point: string; id: string }

/**
 * The sender for one module's mail, or null to leave it to Settings > Emails.
 *
 * First provider with an answer wins, in module-load order. A provider that
 * throws is stepped over rather than allowed to take the email down with it:
 * the wrong From line is a nuisance, an unsent order confirmation is not.
 */
export async function resolveOutboundEmailIdentity(moduleName: string): Promise<OutboundEmailIdentity | null> {
  const components = moduleExtensionPointComponents[OUTBOUND_EMAIL_IDENTITY_POINT] ?? {}
  if (Object.keys(components).length === 0) return null

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== OUTBOUND_EMAIL_IDENTITY_POINT) continue
      const provider = components[entry.id]
      if (!isProvider(provider)) continue
      try {
        const identity = await provider.identityFor(moduleName)
        if (identity?.from?.address) return identity
      } catch (error) {
        console.error(`[email] identity provider ${mod.name}/${entry.id} failed for ${moduleName}`, error)
      }
    }
  }
  return null
}
