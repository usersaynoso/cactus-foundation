import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notification } = vi.hoisted(() => ({
  notification: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

vi.mock('@/lib/db/prisma', () => ({ prisma: { notification } }))

import { upsertAlert, upsertVideoJobNotification } from './alerts'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('upsertAlert', () => {
  it('creates a new notification with reasons', async () => {
    notification.findFirst.mockResolvedValue(null)

    await upsertAlert({
      type: 'message',
      dedupeKey: 'demo',
      title: 'Demo',
      link: '/media',
      reasons: [{ label: 'Queued', detail: '0%', at: '2026-07-25T00:00:00.000Z' }],
    })

    expect(notification.create).toHaveBeenCalledWith({
      data: {
        type: 'message',
        dedupeKey: 'demo',
        title: 'Demo',
        link: '/media',
        actionLabel: null,
        reasons: [{ label: 'Queued', detail: '0%', at: '2026-07-25T00:00:00.000Z' }],
        readAt: null,
      },
    })
  })

  it('updates when the title or reasons change', async () => {
    notification.findFirst.mockResolvedValue({
      id: 'n1',
      title: 'Old',
      link: '/media',
      actionLabel: null,
      reasons: null,
      readAt: null,
    })

    await upsertAlert({
      type: 'message',
      dedupeKey: 'demo',
      title: 'New',
      link: '/media',
      reasons: [{ label: 'Building', detail: '25%', at: '2026-07-25T00:00:00.000Z' }],
    })

    expect(notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: {
        title: 'New',
        link: '/media',
        actionLabel: null,
        reasons: [{ label: 'Building', detail: '25%', at: '2026-07-25T00:00:00.000Z' }],
        readAt: null,
        updatedAt: expect.any(Date),
      },
    })
  })

  it('leaves an omitted link and label exactly as they were', async () => {
    notification.findFirst.mockResolvedValue({
      id: 'n1',
      title: 'Old',
      link: '/media?folder=f1',
      actionLabel: 'Open media folder',
      reasons: null,
      readAt: null,
    })

    await upsertAlert({ type: 'message', dedupeKey: 'demo', title: 'New' })

    expect(notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: expect.objectContaining({ link: '/media?folder=f1', actionLabel: 'Open media folder' }),
    })
  })

  it('keeps a read alert read when only its progress moves', async () => {
    const readAt = new Date('2026-07-25T00:00:00.000Z')
    notification.findFirst.mockResolvedValue({
      id: 'n1',
      title: 'Same',
      link: null,
      actionLabel: null,
      reasons: [{ label: 'Building', detail: '25%', at: '2026-07-25T00:00:00.000Z' }],
      readAt,
    })

    await upsertAlert({
      type: 'message',
      dedupeKey: 'demo',
      title: 'Same',
      link: null,
      reasons: [{ label: 'Building', detail: '40%', at: '2026-07-25T00:01:00.000Z' }],
      resurfaceOnTitleChangeOnly: true,
    })

    expect(notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: expect.objectContaining({ readAt }),
    })
  })
})

describe('upsertVideoJobNotification', () => {
  it('surfaces a queued job with no button to press', async () => {
    notification.findFirst.mockResolvedValue(null)

    await upsertVideoJobNotification({
      jobId: 'job-123',
      name: 'Office Chair',
      state: 'queued',
      progress: 0,
    })

    expect(notification.create).toHaveBeenCalledWith({
      data: {
        type: 'message',
        dedupeKey: 'video-job:job-123',
        title: 'Optimising video: Office Chair',
        link: null,
        actionLabel: null,
        reasons: [{ label: 'Queued', detail: '0%', at: expect.any(String) }],
        readAt: null,
      },
    })
  })

  it('reads the worker progress as a fraction, not a percentage', async () => {
    notification.findFirst.mockResolvedValue(null)

    await upsertVideoJobNotification({
      jobId: 'job-123',
      name: 'Office Chair',
      state: 'running',
      progress: 0.42,
    })

    expect(notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reasons: [{ label: 'Encoding', detail: '42%', at: expect.any(String) }],
      }),
    })
  })

  it('finishes at 100%, with a button to the folder the video sits in', async () => {
    notification.findFirst.mockResolvedValue(null)

    await upsertVideoJobNotification({
      jobId: 'job-123',
      name: 'Office Chair',
      state: 'done',
      progress: 1,
      folderId: 'fld_1',
    })

    expect(notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Video optimised: Office Chair',
        link: '/media?folder=fld_1',
        actionLabel: 'Open media folder',
        reasons: [{ label: 'Finished', detail: '100%', at: expect.any(String) }],
      }),
    })
  })

  it('points a root-level video at the library root', async () => {
    notification.findFirst.mockResolvedValue(null)

    await upsertVideoJobNotification({ jobId: 'job-123', name: 'Chair', state: 'done', progress: 1, folderId: null })

    expect(notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ link: '/media', actionLabel: 'Open media folder' }),
    })
  })

  it('leaves the finished link alone when the caller does not know the folder', async () => {
    notification.findFirst.mockResolvedValue({
      id: 'n1',
      title: 'Optimising video: Chair',
      link: '/media?folder=fld_1',
      actionLabel: 'Open media folder',
      reasons: null,
      readAt: null,
    })

    await upsertVideoJobNotification({ jobId: 'job-123', name: 'Chair', state: 'done', progress: 1 })

    expect(notification.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: expect.objectContaining({ link: '/media?folder=fld_1', actionLabel: 'Open media folder' }),
    })
  })
})
