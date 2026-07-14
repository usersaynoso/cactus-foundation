import { describe, it, expect } from 'vitest'
import {
  matchesRule,
  scoreConditions,
  isCompleteRule,
  defaultConditionsForLayout,
  conditionTypesForLayout,
  type ConditionRule,
  type RenderContext,
} from './displayConditions'

// These rules decide which layout a visitor actually sees. The interesting cases
// are the half-finished ones: a rule the owner added and never filled in must
// match nothing at all, because every one of these types outranks "entire site",
// so a blank rule that matches by accident silently replaces the site's design.

const page: RenderContext = { pageId: 'abc', slug: 'about', pathname: '/about' }
const notFound: RenderContext = { is404: true, pathname: '/nope' }

describe('matchesRule - completed rules', () => {
  it('entire_site matches anything', () => {
    expect(matchesRule({ type: 'entire_site' }, page)).toBe(true)
    expect(matchesRule({ type: 'entire_site' }, notFound)).toBe(true)
  })

  it('matches a page by id and by slug', () => {
    expect(matchesRule({ type: 'page_id', value: 'abc' }, page)).toBe(true)
    expect(matchesRule({ type: 'page_id', value: 'xyz' }, page)).toBe(false)
    expect(matchesRule({ type: 'page_slug', value: 'about' }, page)).toBe(true)
    expect(matchesRule({ type: 'page_slug', value: 'contact' }, page)).toBe(false)
  })

  it('matches the site status screens', () => {
    expect(matchesRule({ type: 'coming_soon' }, { siteStatus: 'coming_soon' })).toBe(true)
    expect(matchesRule({ type: 'coming_soon' }, { siteStatus: 'maintenance' })).toBe(false)
    expect(matchesRule({ type: 'maintenance' }, { siteStatus: 'maintenance' })).toBe(true)
  })
})

describe('matchesRule - unfinished rules match nothing', () => {
  const blanks: ConditionRule[] = [
    { type: 'page_id' },
    { type: 'page_slug' },
    { type: 'module' },
    { type: 'path_prefix' },
    { type: 'path_prefix', value: '   ' },
  ]

  it.each(blanks)('$type with no value never matches a page', (rule) => {
    expect(matchesRule(rule, page)).toBe(false)
  })

  it.each(blanks)('$type with no value never matches a page without ids', (rule) => {
    // The one that bit: undefined === undefined used to be a match, so a blank
    // page_id rule scored 100 on a 404 - the highest score there is.
    expect(matchesRule(rule, notFound)).toBe(false)
  })

  it('an empty path prefix does not swallow the whole site', () => {
    expect(scoreConditions({ include: [{ type: 'path_prefix', value: '' }], exclude: [] }, page)).toBe(-1)
  })
})

describe('matchesRule - path prefixes respect segment boundaries', () => {
  const prefix = (value: string, pathname: string) =>
    matchesRule({ type: 'path_prefix', value }, { pathname })

  it('matches the prefix itself and anything below it', () => {
    expect(prefix('/blog', '/blog')).toBe(true)
    expect(prefix('/blog', '/blog/hello-world')).toBe(true)
    expect(prefix('/blog/', '/blog/hello-world')).toBe(true)
  })

  it('does not match a different path that merely starts with the same letters', () => {
    expect(prefix('/blog', '/blogging-tips')).toBe(false)
    expect(prefix('/shop', '/shopping-list')).toBe(false)
  })
})

describe('scoreConditions', () => {
  it('takes the highest-scoring matching include rule', () => {
    const score = scoreConditions(
      { include: [{ type: 'entire_site' }, { type: 'page_slug', value: 'about' }], exclude: [] },
      page,
    )
    expect(score).toBe(90)
  })

  it('an exclude rule beats any include rule', () => {
    const score = scoreConditions(
      { include: [{ type: 'page_id', value: 'abc' }], exclude: [{ type: 'entire_site' }] },
      page,
    )
    expect(score).toBe(-1)
  })

  it('a blank exclude rule excludes nothing', () => {
    const score = scoreConditions(
      { include: [{ type: 'entire_site' }], exclude: [{ type: 'page_slug' }] },
      page,
    )
    expect(score).toBe(10)
  })

  it('no matching include rule means the layout is not used', () => {
    expect(scoreConditions({ include: [{ type: 'homepage' }], exclude: [] }, page)).toBe(-1)
    expect(scoreConditions({ include: [], exclude: [] }, page)).toBe(-1)
  })
})

describe('isCompleteRule', () => {
  it('value-free rule types are always complete', () => {
    expect(isCompleteRule({ type: 'entire_site' })).toBe(true)
    expect(isCompleteRule({ type: 'homepage' })).toBe(true)
    expect(isCompleteRule({ type: 'not_found' })).toBe(true)
  })

  it('value-taking rule types need a non-blank value', () => {
    expect(isCompleteRule({ type: 'page_slug' })).toBe(false)
    expect(isCompleteRule({ type: 'page_slug', value: '' })).toBe(false)
    expect(isCompleteRule({ type: 'page_slug', value: ' ' })).toBe(false)
    expect(isCompleteRule({ type: 'page_slug', value: 'about' })).toBe(true)
  })
})

describe('defaults per layout type', () => {
  it('a 404 layout starts life showing on 404s', () => {
    expect(defaultConditionsForLayout('notFound')).toEqual({ include: [{ type: 'not_found' }], exclude: [] })
  })

  it('a module layout starts life site-wide, since that is its only option', () => {
    expect(conditionTypesForLayout('shopProduct')).toEqual(['entire_site'])
    expect(defaultConditionsForLayout('shopProduct')).toEqual({ include: [{ type: 'entire_site' }], exclude: [] })
  })

  it('the types where one layout can displace another start empty', () => {
    expect(defaultConditionsForLayout('header')).toBeNull()
    expect(defaultConditionsForLayout('footer')).toBeNull()
    expect(defaultConditionsForLayout('infoPage')).toBeNull()
    expect(defaultConditionsForLayout('statusPage')).toBeNull()
  })
})
