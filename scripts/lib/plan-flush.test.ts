import { describe, expect, it, vi } from 'vitest'
import type { Client } from 'pg'
import { beginPlanFlush, finishPlanFlush, sweepPlans } from './plan-flush.mjs'

function database() {
  let marker: string | null = null
  let version = 1
  let tablesReady = true
  let refuseMarker = false
  const events: string[] = []
  const query = vi.fn(async (sql: string, params?: string[]) => {
    if (sql.includes('pg_advisory_lock')) { events.push('lock'); return { rows: [] } }
    if (sql.includes('to_regclass')) return { rows: [{ ready: tablesReady }] }
    if (sql.includes('UNION ALL')) return { rows: [{ kind: 'module', name: '001.sql', version }] }
    if (sql.includes('INSERT INTO')) {
      if (refuseMarker) throw new Error('cannot write marker')
      marker = params?.[3] ?? null
      events.push(marker?.startsWith('pending:') ? 'pending' : 'complete')
      return { rows: [] }
    }
    if (sql.includes('SELECT "checksum"')) return { rows: marker ? [{ checksum: marker }] : [] }
    throw new Error(`Unexpected query: ${sql}`)
  })
  return {
    client: { query } as unknown as Client, query, events,
    marker: () => marker,
    change: () => { version++ },
    fresh: () => { tablesReady = false },
    refuseMarker: () => { refuseMarker = true },
  }
}

describe('durable query-plan cleanup', () => {
  it('records pending before work, sweeps on first adoption, skips the next unchanged deployment', async () => {
    const db = database()
    const sweep = vi.fn(async () => 2)
    const options = { sweep, log: vi.fn() }
    const first = await beginPlanFlush(db.client)
    expect(db.events).toEqual(['lock', 'pending'])
    expect(await finishPlanFlush(db.client, first, options)).toEqual({ skipped: false })
    const next = await beginPlanFlush(db.client)
    expect(await finishPlanFlush(db.client, next, options)).toEqual({ skipped: true })
    expect(sweep).toHaveBeenCalledTimes(1)
    expect(db.marker()).toMatch(/^complete:[a-f0-9]{64}$/)
  })

  it('sweeps after a new migration', async () => {
    const db = database()
    const sweep = vi.fn(async () => 0)
    const options = { sweep, log: vi.fn() }
    await finishPlanFlush(db.client, await beginPlanFlush(db.client), options)
    const next = await beginPlanFlush(db.client)
    db.change()
    expect(await finishPlanFlush(db.client, next, options)).toEqual({ skipped: false })
    expect(sweep).toHaveBeenCalledTimes(2)
  })

  it('sweeps after an interrupted attempt even if SQL never reached its migration ledger', async () => {
    const db = database()
    const sweep = vi.fn(async () => 0)
    const options = { sweep, log: vi.fn() }
    await finishPlanFlush(db.client, await beginPlanFlush(db.client), options)
    await beginPlanFlush(db.client) // Simulated kill after DDL, before recording it.
    expect(db.marker()).toMatch(/^pending:/)
    const recovery = await beginPlanFlush(db.client)
    expect(await finishPlanFlush(db.client, recovery, options)).toEqual({ skipped: false })
    expect(sweep).toHaveBeenCalledTimes(2)
  })

  it('does not acknowledge a failed sweep and retries it on the next deployment', async () => {
    const db = database()
    const sweep = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(0)
    const options = { sweep, log: vi.fn() }
    await expect(finishPlanFlush(db.client, await beginPlanFlush(db.client), options)).rejects.toThrow('network')
    expect(db.marker()).toMatch(/^pending:/)
    expect(await finishPlanFlush(db.client, await beginPlanFlush(db.client), options)).toEqual({ skipped: false })
  })

  it('never grants permission to migrate if the durable pending write fails', async () => {
    const db = database()
    db.refuseMarker()
    await expect(beginPlanFlush(db.client)).rejects.toThrow('cannot write marker')
  })

  it('sweeps on a fresh install whose ledgers do not exist yet', async () => {
    const db = database()
    db.fresh()
    const state = await beginPlanFlush(db.client)
    expect(state).toEqual({ before: null, previous: null })
    const sweep = vi.fn(async () => 0)
    expect(await finishPlanFlush(db.client, state, { sweep, log: vi.fn() })).toEqual({ skipped: false })
    expect(sweep).toHaveBeenCalledOnce()
  })

  it('retains both idle-only sweeps, their delay and the tracking connection exclusion', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ ended: true }, { ended: false }] })
      .mockResolvedValueOnce({ rows: [{ ended: true }] })
    const sleep = vi.fn(async () => {})
    expect(await sweepPlans({ query } as unknown as Client, sleep)).toBe(2)
    expect(sleep).toHaveBeenCalledWith(3000)
    expect(query).toHaveBeenCalledTimes(2)
    const sql: string = query.mock.calls[0]?.[0]
    expect(sql).toContain('datname = current_database()')
    expect(sql).toContain('pid <> pg_backend_pid()')
    expect(sql).toContain("state = 'idle'")
  })
})
