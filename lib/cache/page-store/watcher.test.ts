import { describe, expect, it } from 'vitest'
import { changedTables, toTableWrites } from './watcher'
import { CORE_IGNORED_TABLES, isIgnoredTable } from './policy'

const ignoring = (table: string) => isIgnoredTable(table, [...CORE_IGNORED_TABLES, 'ana_*'])

describe('noticing changes from the table counters', () => {
  it('reads Postgres bigints however the driver returns them', () => {
    const writes = toTableWrites([{ relname: 'a', writes: 1n }, { relname: 'b', writes: 2 }, { relname: 'c', writes: '3' }])
    expect([...writes.values()]).toEqual([1n, 2n, 3n])
  })

  it('reports a price edit, a stock import and a hidden product alike, by table', () => {
    const before = toTableWrites([{ relname: 'shp_products', writes: 10 }, { relname: 'svr_variants', writes: 5 }])
    const after = toTableWrites([{ relname: 'shp_products', writes: 11 }, { relname: 'svr_variants', writes: 5 }])
    expect(changedTables(before, after, ignoring)).toEqual(['shp_products'])
  })

  it('stays quiet about bookkeeping and tables the owner ruled out', () => {
    const before = toTableWrites([{ relname: 'CronRun', writes: 1 }, { relname: 'RateLimit', writes: 1 }, { relname: 'ana_pageviews', writes: 1 }])
    const after = toTableWrites([{ relname: 'CronRun', writes: 9 }, { relname: 'RateLimit', writes: 9 }, { relname: 'ana_pageviews', writes: 9 }])
    expect(changedTables(before, after, ignoring)).toEqual([])
  })

  it('counts an unfamiliar table, because missing a change is the failure that matters', () => {
    const after = toTableWrites([{ relname: 'new_module_prices', writes: 1 }])
    expect(changedTables(new Map(), after, ignoring)).toEqual(['new_module_prices'])
  })

  it('treats counters going backwards as a change', () => {
    const before = toTableWrites([{ relname: 'shp_products', writes: 100 }])
    const after = toTableWrites([{ relname: 'shp_products', writes: 0 }])
    expect(changedTables(before, after, ignoring)).toEqual(['shp_products'])
  })
})
