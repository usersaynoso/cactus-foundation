import { prisma } from '@/lib/db/prisma'
import { notifyEmailTrackingListeners, type EmailTrackingEventKind } from './listeners'
import type { TrackingClaim } from './token'

// ---------------------------------------------------------------------------
// Writing down what the site's own tracking saw, and reading it back.
//
// One table, EmailEvent, hanging off the EmailLog row of the send. An open, a
// click, a bounce, a delay: one row each, with the moment, the network address
// and the program name where there was one. The log row itself is never
// touched - the public routes that write here do one insert and nothing else,
// because they run every time a customer opens an email and the site pays for
// every one of those in server time.
//
// Summaries ("opened 3 times, first on Tuesday") are worked out when somebody
// looks, by one grouped query over the handful of rows a send ever collects.
// ---------------------------------------------------------------------------

/** What is stored. `deferred` is a delivery report saying the far end is still
 *  trying - worth showing, and not a failure yet. */
export type StoredEmailEventKind = 'opened' | 'proxy_open' | 'clicked' | 'bounced' | 'deferred'

export type ObservedEvent = {
  kind: 'opened' | 'proxy_open' | 'clicked'
  occurredAt: Date
  ip: string | null
  userAgent: string | null
}

/**
 * Files one open or click that one of our own addresses reported, and tells any
 * module listening.
 *
 * Returns false when there was nothing to file against - the log row has gone
 * to the retention sweep, or never existed on this database (a token minted on
 * a site since restored from an older backup). Neither is an error, and the
 * picture or the redirect has already been served either way.
 */
export async function recordObservedEvent(claim: TrackingClaim, event: ObservedEvent): Promise<boolean> {
  const detail = event.kind === 'clicked' ? claim.u ?? null : null
  try {
    await prisma.emailEvent.create({
      data: {
        emailLogId: claim.e,
        kind: event.kind,
        detail,
        ip: event.ip,
        userAgent: event.userAgent,
        occurredAt: event.occurredAt,
      },
      select: { id: true },
    })
  } catch (error) {
    // P2003 is the foreign key: no such log row. Expected, and quiet.
    if ((error as { code?: string })?.code !== 'P2003') {
      console.error('[email] could not record a tracking event', error)
    }
    return false
  }

  await notifyEmailTrackingListeners({
    emailLogId: claim.e,
    moduleName: claim.m ?? null,
    ref: claim.x ?? null,
    kind: event.kind satisfies EmailTrackingEventKind,
    occurredAt: event.occurredAt,
    detail,
    bounceKind: null,
    ip: event.ip,
    userAgent: event.userAgent,
  })
  return true
}

/** A Message-ID in both the spellings a log row might hold it in. */
function spellings(ids: string[]): string[] {
  const out = new Set<string>()
  for (const raw of ids) {
    const bare = raw.trim().replace(/^<|>$/g, '').trim()
    if (!bare || bare.length > 998) continue
    out.add(bare)
    out.add(`<${bare}>`)
  }
  return [...out]
}

export type BounceReport = {
  /** Every Message-ID the delivery report names as the message it is about -
   *  the original's own, and whatever In-Reply-To and References say. */
  messageIds: string[]
  /** 'hard' - it will not arrive. 'soft' - the far end is still trying. */
  kind: 'hard' | 'soft'
  /** The reason the far end gave, for a person to read. */
  detail: string | null
  occurredAt: Date
}

/**
 * Matches a delivery report that came back to a mailbox against the send it is
 * about, and files it there.
 *
 * Matched on the Message-ID we put on the message (EmailLog.messageId) and on
 * the one the sending service reported back (providerId - for mail sent over
 * SMTP that IS the Message-ID on the message, because the mail library writes
 * one when the caller did not). Both spellings, with and without the angle
 * brackets, because a report is not consistent about which it uses.
 *
 * Idempotent: the same report read twice - a mailbox checked again, a sync
 * rewound - finds its row already there and changes nothing.
 *
 * Returns the log rows it filed against.
 */
export async function recordEmailBounce(report: BounceReport): Promise<string[]> {
  const wanted = spellings(report.messageIds)
  if (wanted.length === 0) return []

  const rows = await prisma.emailLog.findMany({
    where: { OR: [{ messageId: { in: wanted } }, { providerId: { in: wanted } }] },
    select: { id: true, moduleName: true },
  })

  const kind: StoredEmailEventKind = report.kind === 'hard' ? 'bounced' : 'deferred'
  const detail = report.detail ? report.detail.slice(0, 2000) : null
  const filed: string[] = []
  for (const row of rows) {
    const already = await prisma.emailEvent.findFirst({
      where: { emailLogId: row.id, kind, occurredAt: report.occurredAt },
      select: { id: true },
    })
    if (already) continue
    await prisma.emailEvent.create({
      data: { emailLogId: row.id, kind, detail, occurredAt: report.occurredAt },
      select: { id: true },
    })
    filed.push(row.id)
    await notifyEmailTrackingListeners({
      emailLogId: row.id,
      moduleName: row.moduleName,
      ref: null,
      kind: 'bounced',
      occurredAt: report.occurredAt,
      detail,
      bounceKind: report.kind,
      ip: null,
      userAgent: null,
    })
  }
  return filed
}

/** Everything the site's own tracking knows about one send, summed up. */
export type EmailEngagement = {
  openedAt: Date | null
  lastOpenAt: Date | null
  openCount: number
  /** A machine fetched the picture, and nobody is known to have looked. */
  proxyOpenAt: Date | null
  clickedAt: Date | null
  lastClickAt: Date | null
  clickCount: number
  bouncedAt: Date | null
  bounceDetail: string | null
  deferredAt: Date | null
}

export function emptyEngagement(): EmailEngagement {
  return {
    openedAt: null, lastOpenAt: null, openCount: 0, proxyOpenAt: null,
    clickedAt: null, lastClickAt: null, clickCount: 0,
    bouncedAt: null, bounceDetail: null, deferredAt: null,
  }
}

/**
 * The summary for each of these sends, keyed by log id. A send with nothing
 * recorded is simply absent from the map.
 */
export async function emailEngagementFor(emailLogIds: string[]): Promise<Map<string, EmailEngagement>> {
  const ids = [...new Set(emailLogIds.filter(Boolean))]
  const out = new Map<string, EmailEngagement>()
  if (ids.length === 0) return out

  const grouped = await prisma.emailEvent.groupBy({
    by: ['emailLogId', 'kind'],
    where: { emailLogId: { in: ids } },
    _count: { _all: true },
    _min: { occurredAt: true },
    _max: { occurredAt: true },
  })

  for (const group of grouped) {
    const summary = out.get(group.emailLogId) ?? emptyEngagement()
    const first = group._min.occurredAt ?? null
    const last = group._max.occurredAt ?? null
    const count = group._count._all
    if (group.kind === 'opened') {
      summary.openedAt = first
      summary.lastOpenAt = last
      summary.openCount = count
    } else if (group.kind === 'proxy_open') {
      summary.proxyOpenAt = first
    } else if (group.kind === 'clicked') {
      summary.clickedAt = first
      summary.lastClickAt = last
      summary.clickCount = count
    } else if (group.kind === 'bounced') {
      summary.bouncedAt = last
    } else if (group.kind === 'deferred') {
      summary.deferredAt = last
    }
    out.set(group.emailLogId, summary)
  }

  // The reason for the latest bounce, where there was one. Rare enough that a
  // second small query only for those is cheaper than carrying every detail.
  const bounced = [...out.entries()].filter(([, s]) => s.bouncedAt).map(([id]) => id)
  if (bounced.length > 0) {
    const reasons = await prisma.emailEvent.findMany({
      where: { emailLogId: { in: bounced }, kind: 'bounced' },
      orderBy: { occurredAt: 'desc' },
      select: { emailLogId: true, detail: true },
    })
    for (const reason of reasons) {
      const summary = out.get(reason.emailLogId)
      if (summary && summary.bounceDetail === null && reason.detail) summary.bounceDetail = reason.detail
    }
  }

  return out
}

/** Every event on one send, oldest first, for a screen showing the working. */
export async function listEmailEvents(emailLogId: string): Promise<Array<{
  id: string
  kind: StoredEmailEventKind
  detail: string | null
  ip: string | null
  userAgent: string | null
  occurredAt: Date
}>> {
  const rows = await prisma.emailEvent.findMany({
    where: { emailLogId },
    orderBy: { occurredAt: 'asc' },
    take: 500,
    select: { id: true, kind: true, detail: true, ip: true, userAgent: true, occurredAt: true },
  })
  return rows.map((row) => ({ ...row, kind: row.kind as StoredEmailEventKind }))
}
