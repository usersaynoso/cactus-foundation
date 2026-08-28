// The outbound email ledger. See the EmailLog model in prisma/schema.prisma for
// what it holds and, more to the point, what it deliberately does not.
//
// Two rules govern everything here:
//
//  1. Writing the ledger must never take the email down with it. A site whose
//     EmailLog table is missing (an install mid-update, a database that has not
//     had the reconcile yet) must still send order confirmations. Every write is
//     wrapped and a failure is logged to the console and forgotten.
//  2. No bodies. Not the html, not the text, not the attachments.

import type { Prisma } from '@prisma/client'

export type EmailLogEntry = {
  toAddress: string
  ccAddresses?: string[]
  subject: string
  templateKey?: string
  moduleName?: string
  status: 'sent' | 'failed'
  error?: string
  messageId?: string
  providerId?: string
  meta?: Prisma.InputJsonValue
}

/** Record one send attempt. Never throws, never rejects. */
export async function recordEmailSend(entry: EmailLogEntry): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db/prisma')
    await prisma.emailLog.create({
      data: {
        toAddress: entry.toAddress,
        ccAddresses: entry.ccAddresses ?? [],
        subject: entry.subject,
        templateKey: entry.templateKey ?? null,
        moduleName: entry.moduleName ?? null,
        status: entry.status,
        // A provider's error body can be a page of JSON; the useful part is at
        // the front and the rest would sit in the table for a year.
        error: entry.error ? entry.error.slice(0, 2000) : null,
        messageId: entry.messageId ?? null,
        providerId: entry.providerId ?? null,
        ...(entry.meta === undefined ? {} : { meta: entry.meta }),
      },
    })
  } catch (err) {
    console.error('[email] could not record the send in the email log:', err)
  }
}

/** Delete ledger rows older than the site's retention window. Returns how many
 *  went. Called by the nightly cron; safe to call at any time. */
export async function purgeEmailLog(): Promise<number> {
  const { prisma } = await import('@/lib/db/prisma')
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { emailLogRetentionMonths: true },
  })
  const months = config?.emailLogRetentionMonths ?? 12
  // Zero or less would mean "keep nothing", which is never what an owner meant
  // by leaving a box empty. Treat it as the default.
  const window = months > 0 ? months : 12

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - window)

  const { count } = await prisma.emailLog.deleteMany({ where: { sentAt: { lt: cutoff } } })
  return count
}
