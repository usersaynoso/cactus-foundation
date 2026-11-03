import { describe, expect, it, vi } from 'vitest'

import {
  CLOSED_CONNECTION_REPLAYS,
  isClosedConnectionError,
  isReadOnlySql,
  isReplayableRead,
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
