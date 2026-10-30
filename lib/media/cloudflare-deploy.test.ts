import { describe, expect, it } from 'vitest'
import { mediaWorkerScriptName } from './cloudflare-deploy'

describe('mediaWorkerScriptName', () => {
  it('gives each site its own Worker, named after its hostname', () => {
    expect(mediaWorkerScriptName('deskwell.co.uk')).toBe('cactus-media-deskwell-co-uk')
    expect(mediaWorkerScriptName('oasis.christaylorguest.com')).toBe('cactus-media-oasis-christaylorguest-com')
  })

  it('never hands two sites on one account the same name', () => {
    expect(mediaWorkerScriptName('example.com')).not.toBe(mediaWorkerScriptName('shop.example.com'))
  })

  it('normalises case and a trailing dot', () => {
    expect(mediaWorkerScriptName('WWW.Example.COM.')).toBe('cactus-media-www-example-com')
  })

  it('stays within the 63-character limit and keeps long names distinct', () => {
    const a = mediaWorkerScriptName(`${'a'.repeat(70)}.example.com`)
    const b = mediaWorkerScriptName(`${'a'.repeat(70)}.example.org`)
    expect(a.length).toBeLessThanOrEqual(63)
    expect(b.length).toBeLessThanOrEqual(63)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^cactus-media-[a-z0-9-]+$/)
  })

  it('refuses an empty hostname rather than falling back to a shared name', () => {
    expect(() => mediaWorkerScriptName('  ')).toThrow()
  })
})
