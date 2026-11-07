import { describe, expect, it } from 'vitest'
import { GateRefusedError, RenderGate } from './gate'

const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('the render gate', () => {
  it('never lets more than the limit run at once, and serves the line in order', async () => {
    const gate = new RenderGate({ maxActive: 2, maxQueued: 10, maxWaitMs: 1000 })
    const started: number[] = []
    for (const n of [1, 2, 3, 4]) void gate.acquire().then(() => started.push(n))
    await tick()
    expect(started).toEqual([1, 2])
    expect(gate.activeCount).toBe(2)
    expect(gate.queuedCount).toBe(2)
    gate.release()
    await tick()
    expect(started).toEqual([1, 2, 3])
    expect(gate.activeCount).toBe(2)
  })

  it('turns people away once the line is full, rather than growing without limit', async () => {
    const gate = new RenderGate({ maxActive: 1, maxQueued: 1, maxWaitMs: 1000 })
    await gate.acquire()
    void gate.acquire().catch(() => undefined)
    await expect(gate.acquire()).rejects.toMatchObject({ reason: 'full' })
    expect(gate.queuedCount).toBe(1)
  })

  it('gives up on a wait that has gone on too long and removes it from the line', async () => {
    const gate = new RenderGate({ maxActive: 1, maxQueued: 5, maxWaitMs: 10 })
    await gate.acquire()
    await expect(gate.acquire()).rejects.toBeInstanceOf(GateRefusedError)
    expect(gate.queuedCount).toBe(0)
    gate.release()
    expect(gate.activeCount).toBe(0)
  })

  it('background work never jumps a waiting visitor or fills the gate', async () => {
    const gate = new RenderGate({ maxActive: 3, maxQueued: 5, maxWaitMs: 1000 })
    expect(gate.tryAcquireBackground(2)).toBe(true)
    expect(gate.tryAcquireBackground(2)).toBe(true)
    expect(gate.tryAcquireBackground(2)).toBe(false)
    await gate.acquire()
    void gate.acquire().catch(() => undefined)
    gate.release()
    await tick()
    void gate.acquire().catch(() => undefined)
    expect(gate.queuedCount).toBe(1)
    expect(gate.tryAcquireBackground(3)).toBe(false)
  })
})
