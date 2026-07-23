import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UploadTask } from './upload-status-client'

// The store is a module-level singleton, so each test re-imports a fresh copy to
// start from an empty batch. Fake timers let us drive the progress-coalescing
// throttle deterministically instead of waiting FLUSH_MS of real time.
async function freshStore() {
  vi.resetModules()
  return import('./upload-status-client')
}

function task(id: string, over: Partial<UploadTask> = {}): UploadTask {
  return { id, name: `${id}.jpg`, size: 1000, status: 'queued', progress: 0, destination: 'Photos', ...over }
}

describe('upload-status-client', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tallies statuses into the snapshot the moment a batch is added', async () => {
    const s = await freshStore()
    s.addUploads([task('a'), task('b'), task('c')])
    const snap = s.getUploadSnapshot()
    expect(snap.total).toBe(3)
    expect(snap.active).toBe(3) // queued counts as active
    expect(snap.overallProgress).toBe(0)
  })

  it('coalesces progress updates behind the flush throttle', async () => {
    const s = await freshStore()
    s.addUploads([task('a', { status: 'uploading' }), task('b', { status: 'done', progress: 1 })])

    // A progress tick is scheduled, not applied synchronously - the whole point,
    // so 25,000 files in flight don't each force a rebuild + repaint.
    s.updateUpload('a', { progress: 0.5 })
    expect(s.getUploadSnapshot().overallProgress).toBe(0.5) // still the pre-tick value (b done = 1, a = 0) → 0.5

    s.updateUpload('a', { progress: 0.9 })
    vi.advanceTimersByTime(120)
    // b (1) + a (0.9) over 2 files.
    expect(s.getUploadSnapshot().overallProgress).toBeCloseTo(0.95)
  })

  it('caps the visible list and reports the remainder as hidden', async () => {
    const s = await freshStore()
    s.addUploads(Array.from({ length: 60 }, (_, i) => task(`f${i}`)))
    const snap = s.getUploadSnapshot()
    expect(snap.total).toBe(60)
    expect(snap.visible.length).toBe(50)
    expect(snap.hidden).toBe(10)
  })

  it('surfaces failures in the visible list even behind a pile of finished files', async () => {
    const s = await freshStore()
    s.addUploads([
      ...Array.from({ length: 50 }, (_, i) => task(`d${i}`, { status: 'done', progress: 1 })),
      task('bad', { status: 'error', error: 'nope' }),
    ])
    const snap = s.getUploadSnapshot()
    expect(snap.failed).toBe(1)
    expect(snap.done).toBe(50)
    // Errors are collected first, so the one failure isn't crowded out of the cap.
    expect(snap.visible.some((t) => t.id === 'bad')).toBe(true)
  })

  it('clearFinishedUploads keeps only what is still in flight', async () => {
    const s = await freshStore()
    s.addUploads([
      task('up', { status: 'uploading', progress: 0.3 }),
      task('ok', { status: 'done', progress: 1 }),
      task('err', { status: 'error', error: 'x' }),
    ])
    s.clearFinishedUploads()
    const snap = s.getUploadSnapshot()
    expect(snap.total).toBe(1)
    expect(snap.active).toBe(1)
    expect(snap.visible[0]?.id).toBe('up')
  })

  it('dismissUpload removes a single task', async () => {
    const s = await freshStore()
    s.addUploads([task('a', { status: 'done', progress: 1 }), task('b', { status: 'done', progress: 1 })])
    s.dismissUpload('a')
    const snap = s.getUploadSnapshot()
    expect(snap.total).toBe(1)
    expect(snap.visible.map((t) => t.id)).toEqual(['b'])
  })

  it('ignores progress for an unknown id', async () => {
    const s = await freshStore()
    s.addUploads([task('a')])
    s.updateUpload('ghost', { progress: 0.5 })
    vi.advanceTimersByTime(120)
    expect(s.getUploadSnapshot().total).toBe(1)
  })
})
