import { describe, it, expect, vi, beforeEach } from 'vitest'

const findUnique = vi.fn()
const update = vi.fn()
const infoPageUpdateMany = vi.fn()
const memberUpdateMany = vi.fn()

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
    infoPage: { updateMany: (...a: unknown[]) => infoPageUpdateMany(...a) },
    member: { updateMany: (...a: unknown[]) => memberUpdateMany(...a) },
  },
}))

const detachers = vi.fn()
vi.mock('@/lib/media/reference-detachers', () => ({
  getMediaReferenceDetachers: () => detachers(),
}))

const { detachMediaReferences } = await import('@/lib/media/detach')

const ITEM = { id: 'm1', url: 'https://cdn.example/oak.webp', key: 'shop/oak.webp' }

beforeEach(() => {
  vi.clearAllMocks()
  findUnique.mockResolvedValue(null)
  update.mockResolvedValue({})
  infoPageUpdateMany.mockResolvedValue({ count: 0 })
  memberUpdateMany.mockResolvedValue({ count: 0 })
  detachers.mockResolvedValue([])
})

describe('detachMediaReferences', () => {
  it('runs every module detacher with the item', async () => {
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)
    detachers.mockResolvedValue([a, b])

    await detachMediaReferences(ITEM)

    expect(a).toHaveBeenCalledWith(ITEM)
    expect(b).toHaveBeenCalledWith(ITEM)
  })

  it('clears only the site-config columns that named this item', async () => {
    findUnique.mockResolvedValue({
      logoMediaId: 'm1',
      logoDarkMediaId: 'm2',
      faviconMediaId: null,
      faviconDarkMediaId: null,
      appIconMediaId: 'm1',
      favicon16MediaId: null,
      favicon32MediaId: null,
      appleTouchIconMediaId: null,
      webManifest192MediaId: null,
      webManifest512MediaId: null,
    })

    await detachMediaReferences(ITEM)

    // The dark logo belongs to a different item and must be left where it is.
    expect(update).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      data: { logoMediaId: null, appIconMediaId: null },
    })
  })

  it('leaves site config alone when nothing there named the item', async () => {
    findUnique.mockResolvedValue({ logoMediaId: 'm9', logoDarkMediaId: null })
    await detachMediaReferences(ITEM)
    expect(update).not.toHaveBeenCalled()
  })

  // A module detacher is allowed to throw, and the throw has to abort the whole
  // delete. If core's own writes went first, a module blowing up would cost the
  // site its logo for a delete that then did not happen.
  it('has not touched core\'s own columns when a module detacher throws', async () => {
    detachers.mockResolvedValue([vi.fn().mockRejectedValue(new Error('shop is having a moment'))])
    findUnique.mockResolvedValue({ logoMediaId: 'm1' })

    await expect(detachMediaReferences(ITEM)).rejects.toThrow('shop is having a moment')

    expect(findUnique).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(infoPageUpdateMany).not.toHaveBeenCalled()
    expect(memberUpdateMany).not.toHaveBeenCalled()
  })

  it('clears a page social image and a member avatar by id', async () => {
    await detachMediaReferences(ITEM)
    expect(infoPageUpdateMany).toHaveBeenCalledWith({ where: { ogImageId: 'm1' }, data: { ogImageId: null } })
    expect(memberUpdateMany).toHaveBeenCalledWith({ where: { avatarMediaId: 'm1' }, data: { avatarMediaId: null } })
  })
})
