import { describe, expect, it, vi } from 'vitest'

import {
  CLOSED_CONNECTION_REPLAYS,
  isClosedConnectionError,
  isReadOnlySql,
  isReplayableRead,
  retryIdempotentWrite,
  retryOnClosedConnection,
} from './connection-retry'

const closed = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' })
const terminated = Object.assign(new Error('Raw query failed.'), {
  code: 'P2010',
  meta: { code: 'E57P01', message: 'terminating connection due to administrator command' },
})

describe('isClosedConnectionError', () => {
  it('recognises a connection the server already closed', () => {
    expect(isClosedConnectionError(closed)).toBe(true)
    expect(isClosedConnectionError(terminated)).toBe(true)
    expect(isClosedConnectionError(new Error('terminating connection due to administrator command'))).toBe(true)
  })

  it('leaves every other failure alone', () => {
    expect(isClosedConnectionError(new Error('Unique constraint failed'))).toBe(false)
    expect(isClosedConnectionError(Object.assign(new Error('x'), { code: 'P2002' }))).toBe(false)
    expect(isClosedConnectionError(null)).toBe(false)
    expect(isClosedConnectionError('P1017')).toBe(false)
  })
})

describe('isReadOnlySql', () => {
  it('accepts plain reads, comments and all', () => {
    expect(isReadOnlySql('SELECT 1')).toBe(true)
    expect(isReadOnlySql('  \n  select * from "x"')).toBe(true)
    expect(isReadOnlySql('-- why\n/* more */ SELECT 1')).toBe(true)
    expect(isReadOnlySql('WITH a AS (SELECT 1) SELECT * FROM a')).toBe(true)
  })

  it('refuses anything that writes', () => {
    expect(isReadOnlySql('INSERT INTO "RateLimit" VALUES (1) RETURNING *')).toBe(false)
    expect(isReadOnlySql('UPDATE x SET y = 1')).toBe(false)
    expect(isReadOnlySql('DELETE FROM x')).toBe(false)
    expect(isReadOnlySql('WITH gone AS (DELETE FROM x RETURNING *) SELECT * FROM gone')).toBe(false)
    expect(isReadOnlySql('-- SELECT\nUPDATE x SET y = 1')).toBe(false)
  })
})

describe('isReplayableRead', () => {
  it('replays model reads but never model writes', () => {
    expect(isReplayableRead('findMany', {})).toBe(true)
    expect(isReplayableRead('count', {})).toBe(true)
    expect(isReplayableRead('create', {})).toBe(false)
    expect(isReplayableRead('upsert', {})).toBe(false)
    expect(isReplayableRead('$executeRaw', { sql: 'SELECT 1' })).toBe(false)
  })

  it('reads raw SQL in both shapes Prisma hands over', () => {
    expect(isReplayableRead('$queryRaw', { sql: 'SELECT 1', values: [] })).toBe(true)
    expect(isReplayableRead('$queryRaw', { sql: 'INSERT INTO x VALUES (1) RETURNING id', values: [] })).toBe(false)
    expect(isReplayableRead('$queryRawUnsafe', ['SELECT $1', 1])).toBe(true)
    expect(isReplayableRead('$queryRawUnsafe', ['DELETE FROM x'])).toBe(false)
    expect(isReplayableRead('$queryRaw', undefined)).toBe(false)
  })
})

describe('retryOnClosedConnection', () => {
  it('replays a read until it lands on a live connection', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(closed)
      .mockRejectedValueOnce(terminated)
      .mockResolvedValueOnce('rows')
    await expect(retryOnClosedConnection('findMany', {}, run)).resolves.toBe('rows')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('never replays a write', async () => {
    const run = vi.fn().mockRejectedValue(closed)
    await expect(retryOnClosedConnection('create', {}, run)).rejects.toBe(closed)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not retry an unrelated failure', async () => {
    const other = new Error('Unique constraint failed')
    const run = vi.fn().mockRejectedValue(other)
    await expect(retryOnClosedConnection('findMany', {}, run)).rejects.toBe(other)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('gives up after a bounded number of replays', async () => {
    const run = vi.fn().mockRejectedValue(closed)
    await expect(retryOnClosedConnection('findMany', {}, run)).rejects.toBe(closed)
    expect(run).toHaveBeenCalledTimes(CLOSED_CONNECTION_REPLAYS + 1)
  })
})

describe('retryIdempotentWrite', () => {
  it('replays a vouched-for write until it lands on a live connection', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(closed)
      .mockRejectedValueOnce(terminated)
      .mockResolvedValueOnce('updated')
    await expect(retryIdempotentWrite(run)).resolves.toBe('updated')
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('does not retry an unrelated failure', async () => {
    const other = new Error('Record to update not found')
    const run = vi.fn().mockRejectedValue(other)
    await expect(retryIdempotentWrite(run)).rejects.toBe(other)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('gives up after a bounded number of replays', async () => {
    const run = vi.fn().mockRejectedValue(closed)
    await expect(retryIdempotentWrite(run)).rejects.toBe(closed)
    expect(run).toHaveBeenCalledTimes(CLOSED_CONNECTION_REPLAYS + 1)
  })
})

describe('CLOSED_CONNECTION_REPLAYS', () => {
  // A deploy's sweep can end every connection in the pool at once. The budget has
  // to walk past all of them, or a read that draws enough dead ones in a row fails
  // a page the next connection would have served (Deskwell, 2026-11-25: 13-slot
  // pool, budget of 5).
  it('covers a default pool on a large machine', () => {
    expect(CLOSED_CONNECTION_REPLAYS).toBeGreaterThanOrEqual(32)
  })

  it('grows to cover a larger pool set on the database address', async () => {
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db?connection_limit=80'
    vi.resetModules()
    try {
      const fresh = await import('./connection-retry')
      expect(fresh.CLOSED_CONNECTION_REPLAYS).toBe(81)
    } finally {
      if (before === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = before
      vi.resetModules()
    }
  })
})
