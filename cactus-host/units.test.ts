import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, parseConfig } from './config.ts'
import { hostWithSite } from './testing.ts'
import { slotUnit } from './units.ts'

function unitWith(perSite: unknown): string {
  const { host, site, paths } = hostWithSite()
  const config = { ...host.config, site: parseConfig({ site: { perSite } }).site }
  return slotUnit(config, site, paths, 'a')
}

describe('per-site tuning', () => {
  it('changes nothing for a site with none', () => {
    const { host, site, paths } = hostWithSite()
    expect(host.config.site.perSite).toEqual({})
    const unit = slotUnit(host.config, site, paths, 'a')
    expect(unit).not.toContain('MALLOC_ARENA_MAX')
    expect(unit).not.toContain('MemoryHigh')
  })

  it('writes both settings into the named site only', () => {
    const unit = unitWith({ shop: { mallocArenaMax: 2, memoryHigh: '2600M' } })
    expect(unit).toContain('Environment=MALLOC_ARENA_MAX=2\n')
    expect(unit).toContain('MemoryHigh=2600M\n')
    expect(unitWith({ other: { mallocArenaMax: 2 } })).not.toContain('MALLOC_ARENA_MAX')
  })

  it('takes either setting alone', () => {
    expect(unitWith({ shop: { mallocArenaMax: 2 } })).not.toContain('MemoryHigh')
    expect(unitWith({ shop: { memoryHigh: '2G' } })).not.toContain('MALLOC_ARENA_MAX')
  })

  it('defaults to no per-site settings on a config that predates them', () => {
    expect(parseConfig({ site: { memoryMax: '4G' } }).site.perSite).toEqual({})
    expect(DEFAULT_CONFIG.site.perSite).toEqual({})
  })

  it('refuses a mistake at start-up rather than half-honouring it', () => {
    const parse = (perSite: unknown, memoryMax = '3G') => () => parseConfig({ site: { memoryMax, perSite } })
    expect(parse('nope')).toThrow('must be an object')
    expect(parse({ shop: 2 })).toThrow('must be an object')
    expect(parse({ shop: { mallocArenaMax: 0 } })).toThrow('site.perSite.shop.mallocArenaMax')
    expect(parse({ shop: { mallocArenaMax: '2' } })).toThrow('site.perSite.shop.mallocArenaMax')
    expect(parse({ shop: { memoryHigh: 'lots' } })).toThrow('site.perSite.shop.memoryHigh')
    expect(parse({ shop: { memoryHigh: '3G' } })).toThrow('must be below site.memoryMax')
    expect(parse({ shop: { memoryHigh: '4000M' } })).toThrow('must be below site.memoryMax')
    expect(parse({ shop: { mallocArenaMaxx: 2 } })).toThrow('is not a setting')
    expect(parse({ shop: { memoryHigh: '4G' } }, 'infinity')).not.toThrow()
  })
})
