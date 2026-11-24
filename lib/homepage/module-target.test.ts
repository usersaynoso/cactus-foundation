import { describe, expect, it } from 'vitest'
import {
  homepageOptionValue,
  homepageWriteFromPatch,
  parseHomepageOptionValue,
  readHomepageModuleTarget,
  safeHomepageHref,
} from './module-target'

describe('readHomepageModuleTarget', () => {
  it('reads a complete module target', () => {
    expect(readHomepageModuleTarget({ homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }))
      .toEqual({ moduleId: 'tg-finance', kind: 'screens', entityId: 'money' })
  })

  it('is null when nothing is stored, or the row is missing', () => {
    expect(readHomepageModuleTarget(null)).toBeNull()
    expect(readHomepageModuleTarget(undefined)).toBeNull()
    expect(readHomepageModuleTarget({ homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null })).toBeNull()
  })

  it('is null for a half-written target rather than guessing the rest', () => {
    expect(readHomepageModuleTarget({ homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: null })).toBeNull()
    expect(readHomepageModuleTarget({ homepageModuleId: '', homepageEntityKind: 'screens', homepageEntityId: 'money' })).toBeNull()
  })
})

describe('safeHomepageHref', () => {
  it('accepts a path on this site, with or without a query', () => {
    expect(safeHomepageHref('/money')).toBe('/money')
    expect(safeHomepageHref('/blog/hello?ref=home#top')).toBe('/blog/hello?ref=home#top')
  })

  it('refuses the root itself, which would send / to /', () => {
    expect(safeHomepageHref('/')).toBeNull()
    expect(safeHomepageHref('/?x=1')).toBeNull()
    expect(safeHomepageHref('/#top')).toBeNull()
  })

  it('refuses anything that could leave the site', () => {
    expect(safeHomepageHref('https://elsewhere.example/')).toBeNull()
    expect(safeHomepageHref('//elsewhere.example/')).toBeNull()
    expect(safeHomepageHref('/\\elsewhere.example')).toBeNull()
    expect(safeHomepageHref('/money\\x')).toBeNull()
    expect(safeHomepageHref('javascript:alert(1)')).toBeNull()
    expect(safeHomepageHref('money')).toBeNull()
  })

  it('refuses control characters, non-strings and silly lengths', () => {
    expect(safeHomepageHref('/mo\nney')).toBeNull()
    expect(safeHomepageHref('/mo\u007fney')).toBeNull()
    expect(safeHomepageHref(undefined)).toBeNull()
    expect(safeHomepageHref(42)).toBeNull()
    expect(safeHomepageHref('/' + 'a'.repeat(2048))).toBeNull()
  })
})

describe('homepage option values', () => {
  it('round-trips a module target', () => {
    const target = { moduleId: 'tg-finance', kind: 'screens', entityId: 'money' }
    const value = homepageOptionValue(target)
    expect(value.startsWith('module:')).toBe(true)
    expect(parseHomepageOptionValue(value)).toEqual({ type: 'module', target })
  })

  it('keeps ids containing separators intact', () => {
    const target = { moduleId: 'a', kind: 'b:c', entityId: 'x/y"z' }
    expect(parseHomepageOptionValue(homepageOptionValue(target))).toEqual({ type: 'module', target })
  })

  it('treats a bare value as a page id and an empty one as no homepage', () => {
    expect(parseHomepageOptionValue('cmabc123')).toEqual({ type: 'page', pageId: 'cmabc123' })
    expect(parseHomepageOptionValue('')).toEqual({ type: 'none' })
  })

  it('reads a damaged module value as no homepage, not as a page id', () => {
    expect(parseHomepageOptionValue('module:not json')).toEqual({ type: 'none' })
    expect(parseHomepageOptionValue('module:["only","two"]')).toEqual({ type: 'none' })
  })
})

describe('homepageWriteFromPatch', () => {
  const MODULE = { homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }
  const NO_MODULE = { homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null }

  it('writes nothing when the payload does not mention the homepage', () => {
    expect(homepageWriteFromPatch({})).toEqual({ ok: true, touched: false, data: {} })
  })

  it('choosing a page clears any module target', () => {
    expect(homepageWriteFromPatch({ homepageId: 'page1' })).toEqual({ ok: true, touched: true, data: { homepageId: 'page1', ...NO_MODULE } })
    expect(homepageWriteFromPatch({ homepageId: 'page1', ...NO_MODULE })).toEqual({ ok: true, touched: true, data: { homepageId: 'page1', ...NO_MODULE } })
  })

  it('choosing module content clears the page', () => {
    expect(homepageWriteFromPatch({ homepageId: null, ...MODULE })).toEqual({ ok: true, touched: true, data: { homepageId: null, ...MODULE } })
    expect(homepageWriteFromPatch(MODULE)).toEqual({ ok: true, touched: true, data: { homepageId: null, ...MODULE } })
  })

  it('choosing None clears both', () => {
    expect(homepageWriteFromPatch({ homepageId: null, ...NO_MODULE })).toEqual({ ok: true, touched: true, data: { homepageId: null, ...NO_MODULE } })
  })

  it('clearing only the module target leaves the page alone', () => {
    expect(homepageWriteFromPatch(NO_MODULE)).toEqual({ ok: true, touched: true, data: NO_MODULE })
  })

  it('an older admin screen sending only homepageId: null leaves a module target alone', () => {
    expect(homepageWriteFromPatch({ homepageId: null })).toEqual({ ok: true, touched: true, data: { homepageId: null } })
  })

  it('refuses a page and module content at once', () => {
    const r = homepageWriteFromPatch({ homepageId: 'page1', ...MODULE })
    expect(r.ok).toBe(false)
  })

  it('refuses a half-filled module target', () => {
    expect(homepageWriteFromPatch({ homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: null }).ok).toBe(false)
    expect(homepageWriteFromPatch({ homepageModuleId: 'tg-finance' }).ok).toBe(false)
    expect(homepageWriteFromPatch({ homepageModuleId: '', homepageEntityKind: 'screens', homepageEntityId: 'money' }).ok).toBe(false)
  })

  it('treats an empty page id as None', () => {
    expect(homepageWriteFromPatch({ homepageId: '' })).toEqual({ ok: true, touched: true, data: { homepageId: null } })
  })
})
