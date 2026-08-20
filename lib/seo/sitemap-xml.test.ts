import { describe, it, expect } from 'vitest'
import { escapeSitemapEntries, escapeSitemapUrl } from './sitemap-xml'

describe('escapeSitemapUrl', () => {
  it('escapes the ampersand between query parameters', () => {
    expect(escapeSitemapUrl('https://example.com/chair?headrest=with-headrest&upholstery-colour=rivet-forge'))
      .toBe('https://example.com/chair?headrest=with-headrest&amp;upholstery-colour=rivet-forge')
  })

  it('escapes every ampersand, not only the first', () => {
    expect(escapeSitemapUrl('https://example.com/a?x=1&y=2&z=3'))
      .toBe('https://example.com/a?x=1&amp;y=2&amp;z=3')
  })

  it('escapes the other four characters the protocol names', () => {
    expect(escapeSitemapUrl(`https://example.com/a?q=<x>"y"'z'`))
      .toBe('https://example.com/a?q=&lt;x&gt;&quot;y&quot;&apos;z&apos;')
  })

  it('leaves an ordinary URL exactly as it was', () => {
    const url = 'https://example.com/oak-desk-1600mm'
    expect(escapeSitemapUrl(url)).toBe(url)
  })

  it('escapes rather than assumes - an already-escaped url would double up, which is why modules hand theirs over raw', () => {
    expect(escapeSitemapUrl('https://example.com/a?x=1&amp;y=2')).toBe('https://example.com/a?x=1&amp;amp;y=2')
  })
})

describe('escapeSitemapEntries', () => {
  it('escapes the url and keeps every other field', () => {
    const when = new Date('2026-01-01T00:00:00.000Z')
    const [entry] = escapeSitemapEntries([
      { url: 'https://example.com/a?x=1&y=2', lastModified: when, changeFrequency: 'weekly', priority: 0.4 },
    ])
    expect(entry).toEqual({
      url: 'https://example.com/a?x=1&amp;y=2',
      lastModified: when,
      changeFrequency: 'weekly',
      priority: 0.4,
    })
  })

  it('escapes alternate-language URLs too', () => {
    const [entry] = escapeSitemapEntries([
      { url: 'https://example.com/a', alternates: { languages: { en: 'https://example.com/a?x=1&y=2' } } },
    ])
    expect(entry!.alternates!.languages!.en).toBe('https://example.com/a?x=1&amp;y=2')
  })

  it('leaves an entry with no alternates without an alternates key', () => {
    const [entry] = escapeSitemapEntries([{ url: 'https://example.com/a' }])
    expect(entry).not.toHaveProperty('alternates')
  })
})
