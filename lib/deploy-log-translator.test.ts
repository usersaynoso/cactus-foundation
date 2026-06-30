import { describe, it, expect } from 'vitest'
import { translateLogLine } from './deploy-log-translator'

describe('translateLogLine', () => {
  it('returns final page count for matching N/N fraction', () => {
    expect(translateLogLine('Generating static pages (77/77)')).toBe('All 77 pages built. Lovely.')
  })

  it('returns progress message for non-final fraction', () => {
    expect(translateLogLine('Generating static pages (19/77)')).toBe("Knocking together all your pages, won't be a tick...")
  })

  it('matches "added N packages" pattern', () => {
    expect(translateLogLine('added 12 packages in 3.2s')).toBe('All the bits and bobs are present and correct.')
  })

  it('matches singular "added 1 package"', () => {
    expect(translateLogLine('added 1 package in 0.8s')).toBe('All the bits and bobs are present and correct.')
  })

  it('returns applied count for module-migrations Applied line', () => {
    expect(translateLogLine('[module-migrations] Applied 3 migrations')).toBe('Applied 3 updates to your add-ons.')
  })

  it('returns no modules message for No active modules found', () => {
    expect(translateLogLine('No active modules found')).toBe('No modules installed -- Vercel will be well pleased.')
  })

  it('returns null for npm funding notice', () => {
    expect(translateLogLine('npm notice funding Run `npm fund` for details')).toBeNull()
  })

  it('returns null for Node version lines', () => {
    expect(translateLogLine('Running Node.js 20.11.0')).toBeNull()
  })

  it('returns null for Prisma tip lines', () => {
    expect(translateLogLine('Prisma Migrate created your database. Tip: Run prisma studio to explore your data.')).toBeNull()
  })

  it('handles Cloning github.com/', () => {
    expect(translateLogLine('Cloning github.com/myorg/myrepo')).toBe('Popping over to grab the latest code from GitHub...')
  })

  it('handles Build cache uploaded', () => {
    expect(translateLogLine('Build cache uploaded: 42.1 MB in 2.3s')).toBe("Bish bash bosh. You're live.")
  })

  it('handles Generating static pages with no fraction', () => {
    expect(translateLogLine('Generating static pages...')).toBe("Knocking together all your pages, won't be a tick...")
  })
})
