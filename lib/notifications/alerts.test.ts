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

import { upsertAlert, upsertSequenceNotification } from './alerts'

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
      reasons: null,
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
        reasons: [{ label: 'Building', detail: '25%', at: '2026-07-25T00:00:00.000Z' }],
        readAt: null,
        updatedAt: expect.any(Date),
      },
    })
  })
})

describe('upsertSequenceNotification', () => {
  it('surfaces queued sequence progress in notifications', async () => {
    notification.findFirst.mockResolvedValue(null)

    await upsertSequenceNotification({
      jobId: 'job-123',
      name: 'Office Chair',
      state: 'queued',
      progress: 0,
    })

    expect(notification.create).toHaveBeenCalledWith({
      data: {
        type: 'message',
        dedupeKey: 'sequence-job:job-123',
        title: 'Scroll sequence in progress: Office Chair',
        link: '/media',
        reasons: [{ label: 'Queued', detail: '0%', at: expect.any(String) }],
        readAt: null,
      },
    })
  })
})
