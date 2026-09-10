import { describe, expect, it } from 'vitest'
import { serialiseRobotsTxt } from './robots-txt'

describe('serialiseRobotsTxt', () => {
  it('writes the ordinary allow-everything file', () => {
    const out = serialiseRobotsTxt({
      groups: [{ userAgents: ['*'], allow: ['/'], disallow: ['/cactus-admin/', '/api/'] }],
      sitemaps: ['https://example.com/sitemap.xml'],
    })
    expect(out).toBe(
      'User-agent: *\nAllow: /\nDisallow: /cactus-admin/\nDisallow: /api/\n\nSitemap: https://example.com/sitemap.xml\n',
    )
  })

  it('writes the hidden-site file with no sitemap', () => {
    expect(serialiseRobotsTxt({ groups: [{ userAgents: ['*'], disallow: ['/'] }] }))
      .toBe('User-agent: *\nDisallow: /\n')
  })

  it('puts several agents in one group and keeps extra lines inside it', () => {
    const out = serialiseRobotsTxt({
      groups: [
        { userAgents: ['*'], extraLines: ['Content-Signal: search=yes, ai-train=no'], allow: ['/'] },
        { userAgents: ['GPTBot', 'ClaudeBot'], disallow: ['/'], comment: 'Blocked' },
      ],
    })
    expect(out).toBe(
      'User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /\n\n'
      + '# Blocked\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n',
    )
  })

  it('drops a group that addresses nobody rather than orphaning its rules', () => {
    const out = serialiseRobotsTxt({
      groups: [
        { userAgents: ['*'], allow: ['/'] },
        { userAgents: ['  '], disallow: ['/secret'] },
      ],
    })
    expect(out).not.toContain('/secret')
  })

  it('strips newlines out of values so one entry cannot become two directives', () => {
    const out = serialiseRobotsTxt({
      groups: [{ userAgents: ['*'], disallow: ['/a\nDisallow: /'] }],
    })
    expect(out).toBe('User-agent: *\nDisallow: /a Disallow: /\n')
  })

  it('emits header comments above everything, once', () => {
    const out = serialiseRobotsTxt({
      headerComments: ['Markdown copies: https://example.com/llms.txt'],
      groups: [{ userAgents: ['*'], allow: ['/'] }],
    })
    expect(out.startsWith('# Markdown copies: https://example.com/llms.txt\n\nUser-agent: *')).toBe(true)
  })
})
