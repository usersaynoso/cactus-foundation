import { describe, expect, it } from 'vitest'
import { planUploadJobs, runUploadPool, type BatchEntry, type ClashInfo, type UploadChoice } from '@/lib/media/upload-batch'

// The bulk-upload prompt path went wrong twice without a single test on it -
// the dialog loop and the worker pool lived inside a React component where
// nothing could exercise them. These tests pin the behaviour that matters:
// every task always settles, the dialog is asked exactly as often as it
// should be, and one bad file never takes the batch down with it.

function entry(name: string, blocked = false): BatchEntry<string> {
  return { file: name, taskId: `t-${name}`, name, blocked }
}

function clashMap(...names: string[]): Map<string, ClashInfo> {
  return new Map(names.map((n) => [n, { existingId: `id-${n}`, suggestedName: n.replace(/\.(\w+)$/, '-1.$1') }]))
}

const answer = (choice: UploadChoice, applyToAll = false) => async () => ({ choice, applyToAll })

describe('planUploadJobs', () => {
  it('passes a clash-free batch straight through, never asking', async () => {
    const asked: string[] = []
    const skipped: string[] = []
    const jobs = await planUploadJobs(
      [entry('a.jpg'), entry('b.jpg')],
      new Map(),
      async (c) => { asked.push(c.name); return { choice: 'replace', applyToAll: false } },
      (id) => skipped.push(id),
    )
    expect(asked).toEqual([])
    expect(skipped).toEqual([])
    expect(jobs.map((j) => j.taskId)).toEqual(['t-a.jpg', 't-b.jpg'])
    expect(jobs.every((j) => j.clash === null && j.choice === 'suffix')).toBe(true)
  })

  it('asks once per clash, in file order, counting down the remainder', async () => {
    const seen: Array<{ name: string; remaining: number }> = []
    await planUploadJobs(
      [entry('a.jpg'), entry('b.jpg'), entry('c.jpg')],
      clashMap('a.jpg', 'c.jpg'),
      async (c, remaining) => { seen.push({ name: c.name, remaining }); return { choice: 'suffix', applyToAll: false } },
      () => {},
    )
    expect(seen).toEqual([
      { name: 'a.jpg', remaining: 2 },
      { name: 'c.jpg', remaining: 1 },
    ])
  })

  it('"do the same for the rest" answers every later clash without asking again', async () => {
    let asks = 0
    const jobs = await planUploadJobs(
      [entry('a.jpg'), entry('b.jpg'), entry('c.jpg')],
      clashMap('a.jpg', 'b.jpg', 'c.jpg'),
      async () => { asks++; return { choice: 'replace', applyToAll: true } },
      () => {},
    )
    expect(asks).toBe(1)
    expect(jobs.map((j) => j.choice)).toEqual(['replace', 'replace', 'replace'])
  })

  it('cancel stops the batch: the cancelled file and everything after it is skipped', async () => {
    const skipped: string[] = []
    const jobs = await planUploadJobs(
      [entry('a.jpg'), entry('b.jpg'), entry('c.jpg')],
      clashMap('b.jpg'),
      answer('cancel'),
      (id) => skipped.push(id),
    )
    // a.jpg was clash-free and had already been admitted before the question.
    expect(jobs.map((j) => j.taskId)).toEqual(['t-a.jpg'])
    expect(skipped).toEqual(['t-b.jpg', 't-c.jpg'])
  })

  it('skip drops only its own file', async () => {
    const skipped: string[] = []
    const jobs = await planUploadJobs(
      [entry('a.jpg'), entry('b.jpg')],
      clashMap('a.jpg'),
      answer('skip'),
      (id) => skipped.push(id),
    )
    expect(skipped).toEqual(['t-a.jpg'])
    expect(jobs.map((j) => j.taskId)).toEqual(['t-b.jpg'])
  })

  it('replace keeps the clash on the job so the pool can aim at the existing item', async () => {
    const jobs = await planUploadJobs(
      [entry('a.jpg')],
      clashMap('a.jpg'),
      answer('replace'),
      () => {},
    )
    expect(jobs[0]?.choice).toBe('replace')
    expect(jobs[0]?.clash?.existingId).toBe('id-a.jpg')
  })

  it('files that failed preflight are never asked about and never upload', async () => {
    let asks = 0
    const jobs = await planUploadJobs(
      [entry('a.jpg', true), entry('b.jpg')],
      clashMap('a.jpg'),
      async () => { asks++; return { choice: 'replace', applyToAll: false } },
      () => {},
    )
    expect(asks).toBe(0)
    expect(jobs.map((j) => j.taskId)).toEqual(['t-b.jpg'])
  })

  it('a dialog that throws settles the rest of the batch instead of hanging it', async () => {
    const skipped: string[] = []
    const jobs = await planUploadJobs(
      [entry('a.jpg'), entry('b.jpg'), entry('c.jpg')],
      clashMap('a.jpg'),
      async () => { throw new Error('dialog plumbing died') },
      (id) => skipped.push(id),
    )
    expect(jobs).toEqual([])
    expect(skipped).toEqual(['t-a.jpg', 't-b.jpg', 't-c.jpg'])
  })
})

describe('runUploadPool', () => {
  const silentReport = { start: () => {}, done: () => {}, fail: () => {} }
  const job = (name: string) => ({ file: name, taskId: `t-${name}`, clash: null, choice: 'suffix' as const })

  it('drains every job and reports each exactly once', async () => {
    const events: string[] = []
    const uploaded = await runUploadPool(
      [job('a'), job('b'), job('c')],
      2,
      async () => {},
      {
        start: (id) => events.push(`start:${id}`),
        done: (id) => events.push(`done:${id}`),
        fail: (id) => events.push(`fail:${id}`),
      },
    )
    expect(uploaded).toBe(3)
    for (const id of ['t-a', 't-b', 't-c']) {
      expect(events.filter((e) => e === `start:${id}`)).toHaveLength(1)
      expect(events.filter((e) => e === `done:${id}`)).toHaveLength(1)
    }
    expect(events.some((e) => e.startsWith('fail:'))).toBe(false)
  })

  it('never runs more jobs at once than the pool width', async () => {
    let inFlight = 0
    let peak = 0
    await runUploadPool(
      Array.from({ length: 10 }, (_, i) => job(String(i))),
      3,
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 1))
        inFlight--
      },
      silentReport,
    )
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('one throwing upload fails its own task and nothing else', async () => {
    const failed: Array<{ id: string; message: string }> = []
    const done: string[] = []
    const uploaded = await runUploadPool(
      [job('a'), job('bad'), job('c')],
      2,
      async (j) => { if (j.taskId === 't-bad') throw new Error('boom') },
      {
        start: () => {},
        done: (id) => done.push(id),
        fail: (id, message) => failed.push({ id, message }),
      },
    )
    expect(uploaded).toBe(2)
    expect(done.sort()).toEqual(['t-a', 't-c'])
    expect(failed).toEqual([{ id: 't-bad', message: 'boom' }])
  })

  it('a non-Error rejection still produces a message', async () => {
    const failed: string[] = []
    await runUploadPool(
      [job('a')],
      1,
      async () => { throw 'string rejection' },
      { start: () => {}, done: () => {}, fail: (_, message) => failed.push(message) },
    )
    expect(failed).toEqual(['Upload failed'])
  })
})
