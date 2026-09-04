import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { moduleExtensionPointComponents } from '@/lib/modules/extension-points'
import type { EmailAttachment, EmailSender } from '@/lib/email'

// ---------------------------------------------------------------------------
// Keeping a copy of a module's automatic email somewhere a person can see it.
//
// Core already sends these and writes a line in the email log, which answers
// "did it go" and nothing else. It does not answer "what did we actually say to
// them", and it certainly does not put the answer where the reply is going to
// land - so a supplier answering a purchase order arrives in a mailbox with
// nothing above it, and whoever picks it up is reading one half of a
// conversation.
//
// So a module may publish a recorder at this point and be handed every
// automatic email that has just gone out on another module's behalf. Core knows
// nothing about what a recorder does with it - files it, indexes it, throws it
// away - only that it is offered.
//
// Costs nothing on a site with no recorder installed: the generated registry is
// empty, and this returns before it reaches the database or copies a byte.
// Never throws, and deliberately: the email has already gone by the time this
// runs, and a filing cabinet is not a thing to fail a checkout over.
// ---------------------------------------------------------------------------

export const OUTBOUND_EMAIL_RECORD_POINT = 'core.outbound-email-record'

/** One automatic email, as it actually left. */
export type RecordedOutboundEmail = {
  /** The module whose email this is - purchase-orders, shop, and so on. */
  moduleName: string
  /** Registry key when it came from a template in Settings > Emails. */
  templateKey?: string
  from: EmailSender
  replyTo?: string
  to: string[]
  cc: string[]
  subject: string
  html: string
  text: string
  /** The Message-ID we put on it, when we put one on at all. */
  messageIdHeader?: string
  /** What the sending service called it. Usually the only handle a reply gives
   *  back, because most services stamp their own id over anything we set. */
  providerMessageId?: string
  sentAt: Date
  /** Only what actually travelled - anything dropped for size is already gone
   *  by the time this is built. */
  attachments: EmailAttachment[]
}

export type OutboundEmailRecorder = {
  record(email: RecordedOutboundEmail): Promise<void>
}

function isRecorder(value: unknown): value is OutboundEmailRecorder {
  return !!value && typeof value === 'object' && typeof (value as OutboundEmailRecorder).record === 'function'
}

type ExtensionPointEntry = { point: string; id: string }

/**
 * Offers one sent email to every recorder installed.
 *
 * Every recorder, not the first with an answer - unlike the sender identity,
 * where two answers would be a contradiction. Two modules both wanting a copy
 * of what went out is not a contradiction, it is two filing cabinets.
 *
 * A recorder that throws is stepped over and logged. Nothing in here is allowed
 * to reach the caller: the message has been accepted by the mail service and
 * the customer is already reading it.
 */
export async function recordOutboundModuleEmail(email: RecordedOutboundEmail): Promise<void> {
  const components = moduleExtensionPointComponents[OUTBOUND_EMAIL_RECORD_POINT] ?? {}
  if (Object.keys(components).length === 0) return

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== OUTBOUND_EMAIL_RECORD_POINT) continue
      const recorder = components[entry.id]
      if (!isRecorder(recorder)) continue
      try {
        await recorder.record(email)
      } catch (error) {
        console.error(`[email] recorder ${mod.name}/${entry.id} failed for ${email.moduleName}`, error)
      }
    }
  }
}
