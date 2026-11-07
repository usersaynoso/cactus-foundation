import { describe, expect, it } from 'vitest'
import { isPrivatePath, pageCacheControl } from '@/lib/cache/page-cache'
import { isIgnoredTable, isStorablePath, normaliseQuery, pageStoreKey, parseIgnoredTables, parsePathPatterns } from './policy'

const rules = {
  paths: parsePathPatterns('/shop\n/shop/categories/*, /gazette\nnot-an-address\n/bad?x=1'),
  moduleBases: ['shop', 'gazette', 'search', 'boards'],
}
const storable = (path: string) => isStorablePath(path, rules, isPrivatePath)

describe('which addresses the store may hold', () => {
  it('holds the home page and top-level content pages', () => {
    for (const path of ['/', '/best-sellers', '/black-mesh-office-chairs', '/office-chairs-under-250']) {
      expect(storable(path), path).toBe(true)
    }
  })

  it('holds deeper addresses and module indexes only when named', () => {
    expect(storable('/shop')).toBe(true)
    expect(storable('/gazette')).toBe(true)
    expect(storable('/shop/categories/chairs')).toBe(true)
    expect(storable('/shop/categories/')).toBe(false)
    expect(storable('/shop/collections/new')).toBe(false)
    expect(storable('/search')).toBe(false)
    expect(storable('/boards')).toBe(false)
    expect(storable('/anything/deeper')).toBe(false)
  })

  it('never holds anybody\'s own pages, even if the owner lists them', () => {
    const greedy = { paths: parsePathPatterns('/shop/*\n/cart\n/quote/*'), moduleBases: [] }
    for (const path of [
      '/shop/cart', '/shop/checkout', '/shop/checkout/confirmation', '/shop/track-order', '/shop/track-order/DW-1',
      '/shop/account/orders', '/shop/orders/DW-1', '/shop/invoice/1', '/shop/proforma/1', '/shop/credit-note/1',
      '/shop/downloads/token', '/cart', '/quote/abc', '/purchase-order/1', '/cactus-account/login',
      '/members', '/members/someone', '/page-preview/1', '/layout-preview/1', '/setup',
    ]) {
      expect(isStorablePath(path, greedy, isPrivatePath), path).toBe(false)
    }
  })

  it('does not mistake a slug for a private word', () => {
    expect(storable('/cart-trolleys')).toBe(true)
    expect(storable('/order-form-desks')).toBe(true)
  })

  it('never holds files', () => {
    for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/some-page.md', '/feed.xml']) {
      expect(storable(path), path).toBe(false)
    }
  })

  it('does not hold absurdly long addresses', () => {
    expect(storable(`/${'a'.repeat(600)}`)).toBe(false)
  })
})

describe('query strings', () => {
  it('drops tracking tags so they share one entry with the plain address', () => {
    for (const search of [
      '', '?srsltid=abc', '?utm_source=google&utm_medium=cpc', '?gclid=1&gad_source=1&gad_campaignid=2&gbraid=3',
      '?fbclid=1&msclkid=2', '?UTM_SOURCE=x',
    ]) {
      expect(normaliseQuery(search), search).toBe('')
    }
  })

  it('keeps parameters that change the page, and tracking cannot split them', () => {
    expect(normaliseQuery('?width=180cm')).toBe('?width=180cm')
    expect(normaliseQuery('?page=2&utm_source=x')).toBe('?page=2')
    expect(normaliseQuery('?width=180cm&finish=walnut&srsltid=z')).toBe(normaliseQuery('?finish=walnut&width=180cm'))
  })

  it('keeps repeats of one name in their original order', () => {
    expect(normaliseQuery('?tag=b&a=1&tag=a')).toBe('?a=1&tag=b&tag=a')
  })

  it('keeps secrets, flight data and nonsense out of the store', () => {
    expect(normaliseQuery('?key=secret')).toBeNull()
    expect(normaliseQuery('?token=secret&page=1')).toBeNull()
    expect(normaliseQuery('?_rsc=abc')).toBeNull()
    expect(normaliseQuery('?%E0%A4%A=1')).toBeNull()
    expect(normaliseQuery(`?a=${'x'.repeat(2000)}`)).toBeNull()
  })

  it('keys by host, so a second domain cannot be handed the first one\'s page', () => {
    expect(pageStoreKey('Books.Example.com', '/a', '')).toBe('books.example.com/a')
    expect(pageStoreKey('example.com', '/a', '')).not.toBe(pageStoreKey('books.example.com', '/a', ''))
  })
})

describe('tables that do not count', () => {
  it('parses exact names and families, and ignores junk', () => {
    const ignored = parseIgnoredTables('ana_*\nchat_messages, bad name\nDROP;')
    expect(ignored).toEqual(['ana_*', 'chat_messages'])
    expect(isIgnoredTable('ana_pageviews', ignored)).toBe(true)
    expect(isIgnoredTable('chat_messages', ignored)).toBe(true)
    expect(isIgnoredTable('chat_visitors', ignored)).toBe(false)
    expect(isIgnoredTable('shp_products', ignored)).toBe(false)
  })
})

describe('the shared-cache verdict the store relies on', () => {
  const verdict = (over: { path?: string; method?: string; headers?: Record<string, string>; cookies?: string[]; hasAccessKey?: boolean }) =>
    pageCacheControl({
      enabled: true,
      ttl: 60,
      path: over.path ?? '/best-sellers',
      hasAccessKey: over.hasAccessKey,
      method: over.method ?? 'GET',
      header: (name) => over.headers?.[name] ?? null,
      hasCookie: (name) => (over.cookies ?? []).includes(name),
    })

  it('shares a plain anonymous page', () => {
    expect(verdict({})).toContain('public')
  })

  it('refuses anyone signed in, or holding an order\'s access cookie', () => {
    expect(verdict({ cookies: ['cactus_session'] })).toBeNull()
    expect(verdict({ cookies: ['cactus_member_session'] })).toBeNull()
  })

  it('leaves a visitor with only a consent or analytics cookie on the shared page', () => {
    expect(verdict({ cookies: ['cactus-consent', '_ga'] })).toContain('public')
  })

  it('refuses everything that is not a plain document read', () => {
    expect(verdict({ method: 'POST' })).toBeNull()
    expect(verdict({ headers: { rsc: '1' } })).toBeNull()
    expect(verdict({ headers: { 'next-router-prefetch': '1' } })).toBeNull()
    expect(verdict({ headers: { range: 'bytes=0-1' } })).toBeNull()
    expect(verdict({ hasAccessKey: true })).toBeNull()
  })

  it('tells a client-side navigation from a page load, though Next hides the flight headers', () => {
    expect(verdict({ headers: { 'sec-fetch-dest': 'empty' } })).toBeNull()
    expect(verdict({ headers: { 'sec-fetch-dest': 'iframe' } })).toBeNull()
    expect(verdict({ headers: { 'sec-fetch-dest': 'document' } })).toContain('public')
  })

  it('refuses basket, checkout, account and tracking addresses outright', () => {
    for (const path of ['/shop/cart', '/shop/checkout', '/shop/track-order', '/shop/account/orders']) {
      expect(verdict({ path }), path).toBeNull()
    }
  })
})
