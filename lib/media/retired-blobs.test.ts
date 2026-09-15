import { describe, it, expect, vi, beforeEach } from 'vitest'

// An in-memory queue: enough of MediaRetiredBlob and Media for what the queue and
// the sweep actually do to rows to be read back afterwards.
type QueueRow = { provider: string; key: string; reason: string; deleteAfter: Date; attempts: number; lastError: string | null }
let queue: QueueRow[] = []
let liveKeys: string[] = []
const deleteMedia = vi.fn()
const windows = { enabled: true, ttl: 3600, longTtl: 0, vercelEdgeTtl: 60, behindCloudflare: true }

const find = (provider: string, key: string) => queue.find((r) => r.provider === provider && r.key === key)
const due = (now: Date) => queue.filter((r) => r.deleteAfter <= now).sort((a, b) => +a.deleteAfter - +b.deleteAfter)

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    mediaRetiredBlob: {
      findUnique: async ({ where }: { where: { provider_key: { provider: string; key: string } } }) => {
        const row = find(where.provider_key.provider, where.provider_key.key)
        return row ? { ...row } : null
      },
      upsert: async ({ where, create, update }: { where: { provider_key: { provider: string; key: string } }; create: Omit<QueueRow, 'attempts' | 'lastError'>; update: Partial<QueueRow> }) => {
        const row = find(where.provider_key.provider, where.provider_key.key)
        if (row) Object.assign(row, update)
        else queue.push({ attempts: 0, lastError: null, ...create })
      },
      findMany: async (args: { where?: { deleteAfter?: { lte: Date } }; take?: number }) => {
        const rows = args.where?.deleteAfter ? due(args.where.deleteAfter.lte) : queue
        return rows.slice(0, args.take ?? rows.length).map((r) => ({ ...r }))
      },
      count: async ({ where }: { where: { deleteAfter: { lte: Date } } }) => due(where.deleteAfter.lte).length,
      deleteMany: async ({ where }: { where: { provider: string; key: string } }) => {
        const before = queue.length
        queue = queue.filter((r) => !(r.provider === where.provider && r.key === where.key))
        return { count: before - queue.length }
      },
      update: async ({ where, data }: { where: { provider_key: { provider: string; key: string } }; data: Partial<QueueRow> }) => {
        Object.assign(find(where.provider_key.provider, where.provider_key.key)!, data)
      },
    },
    media: {
      findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
        liveKeys.filter((k) => where.key.in.includes(k)).map((key) => ({ key })),
    },
  },
}))
vi.mock('@/lib/config/site', () => ({ getPageCacheCached: async () => windows }))
vi.mock('@/lib/media/upload', () => ({ deleteMedia: (...a: unknown[]) => deleteMedia(...a) }))

const { retireMediaBlob, retirementHoldSeconds, sweepRetiredMediaBlobs, listRetiringKeys, RETIREMENT_MARGIN_SECONDS, MAX_DELETE_ATTEMPTS } =
  await import('@/lib/media/retired-blobs')

const HOUR = 3600
const past = () => new Date(Date.now() - 1000)
const later = () => Date.now() + 60_000

beforeEach(() => {
  queue = []
  liveKeys = []
  vi.clearAllMocks()
  deleteMedia.mockResolvedValue(undefined)
})

describe('retirementHoldSeconds', () => {
  it('outlasts a CDN copy served stale for a second window, plus Vercel’s own hold', () => {
    // max-age=N then stale-while-revalidate=N is two windows of the same page.
    expect(retirementHoldSeconds({ ttl: HOUR, longTtl: 0, vercelEdgeTtl: 60 })).toBe(2 * HOUR + 60 + RETIREMENT_MARGIN_SECONDS)
  })

  it('uses the long window when it is the longer one - that is where option pages live', () => {
    // The page that broke was a query-string combination of a product, which is what
    // the long window covers.
    expect(retirementHoldSeconds({ ttl: 300, longTtl: 86_400, vercelEdgeTtl: 0 })).toBe(2 * 86_400 + RETIREMENT_MARGIN_SECONDS)
  })

  it('still holds for the margin when there are no windows at all', () => {
    expect(retirementHoldSeconds({ ttl: 0, longTtl: 0, vercelEdgeTtl: 0 })).toBe(RETIREMENT_MARGIN_SECONDS)
  })
})

describe('retireMediaBlob', () => {
  it('queues the blob instead of deleting it', async () => {
    const before = Date.now()
    await retireMediaBlob('B2', 'media/verge-green.jpeg', 'optimise')

    expect(deleteMedia).not.toHaveBeenCalled()
    const row = find('B2', 'media/verge-green.jpeg')
    expect(row?.reason).toBe('optimise')
    const hold = retirementHoldSeconds(windows) * 1000
    expect(+row!.deleteAfter).toBeGreaterThanOrEqual(before + hold)
  })

  it('keeps the later deadline when the same blob is retired twice', async () => {
    const far = new Date(Date.now() + 30 * 24 * HOUR * 1000)
    queue.push({ provider: 'B2', key: 'media/a.jpeg', reason: 'move', deleteAfter: far, attempts: 2, lastError: 'x' })
    await retireMediaBlob('B2', 'media/a.jpeg', 'optimise')

    expect(queue).toHaveLength(1)
    expect(find('B2', 'media/a.jpeg')?.deleteAfter).toEqual(far)
  })

  it('never throws, so a queue that cannot be written leaves the blob in storage', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { prisma } = await import('@/lib/db/prisma')
    const spy = vi.spyOn(prisma.mediaRetiredBlob, 'upsert').mockRejectedValueOnce(new Error('database had a moment'))

    await expect(retireMediaBlob('B2', 'media/a.jpeg', 'resize')).resolves.toBeUndefined()
    expect(deleteMedia).not.toHaveBeenCalled()
    spy.mockRestore()
    error.mockRestore()
  })
})

describe('sweepRetiredMediaBlobs', () => {
  it('deletes what is due and leaves what is not', async () => {
    queue.push(
      { provider: 'B2', key: 'media/due.jpeg', reason: 'optimise', deleteAfter: past(), attempts: 0, lastError: null },
      { provider: 'B2', key: 'media/not-yet.jpeg', reason: 'optimise', deleteAfter: new Date(Date.now() + HOUR * 1000), attempts: 0, lastError: null },
    )
    const result = await sweepRetiredMediaBlobs({ deadline: later() })

    expect(deleteMedia).toHaveBeenCalledWith('B2', 'media/due.jpeg')
    expect(deleteMedia).not.toHaveBeenCalledWith('B2', 'media/not-yet.jpeg')
    expect(result).toMatchObject({ deleted: 1, more: false })
    expect(queue.map((r) => r.key)).toEqual(['media/not-yet.jpeg'])
  })

  it('never deletes a key a library item answers to again', async () => {
    // Moved off and moved straight back, or a new upload on the same exact name.
    queue.push({ provider: 'B2', key: 'media/back-again.jpeg', reason: 'move', deleteAfter: past(), attempts: 0, lastError: null })
    liveKeys = ['media/back-again.jpeg']
    const result = await sweepRetiredMediaBlobs({ deadline: later() })

    expect(deleteMedia).not.toHaveBeenCalled()
    expect(result.reclaimed).toBe(1)
    expect(queue).toEqual([])
  })

  it('puts a failed delete back with a later deadline, then gives up after the last try', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteMedia.mockRejectedValue(new Error('storage said no'))
    queue.push({ provider: 'B2', key: 'media/stuck.jpeg', reason: 'optimise', deleteAfter: past(), attempts: 0, lastError: null })

    const first = await sweepRetiredMediaBlobs({ deadline: later() })
    expect(first.retrying).toBe(1)
    const row = find('B2', 'media/stuck.jpeg')
    expect(row?.attempts).toBe(1)
    expect(row?.lastError).toBe('storage said no')
    expect(+row!.deleteAfter).toBeGreaterThan(Date.now())

    row!.attempts = MAX_DELETE_ATTEMPTS - 1
    row!.deleteAfter = past()
    const last = await sweepRetiredMediaBlobs({ deadline: later() })
    expect(last.abandoned).toBe(1)
    expect(queue).toEqual([])
    warn.mockRestore()
  })

  it('stops at the deadline and says there is more', async () => {
    queue.push({ provider: 'B2', key: 'media/due.jpeg', reason: 'optimise', deleteAfter: past(), attempts: 0, lastError: null })
    const result = await sweepRetiredMediaBlobs({ deadline: Date.now() - 1 })

    expect(deleteMedia).not.toHaveBeenCalled()
    expect(result.more).toBe(true)
  })
})

describe('listRetiringKeys', () => {
  it('matches on provider and key together', async () => {
    queue.push({ provider: 'B2', key: 'media/a.jpeg', reason: 'optimise', deleteAfter: past(), attempts: 0, lastError: null })
    const isRetiring = await listRetiringKeys()

    expect(isRetiring('B2', 'media/a.jpeg')).toBe(true)
    expect(isRetiring('R2', 'media/a.jpeg')).toBe(false)
    expect(isRetiring('B2', 'media/a.jpeg.webp')).toBe(false)
  })
})
