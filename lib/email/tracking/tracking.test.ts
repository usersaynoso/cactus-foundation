import { describe, it, expect } from 'vitest'
import { signTrackingToken, verifyTrackingToken } from './token'
import { instrumentEmailHtml, isTrackableLink, stripOwnOpenBeacons } from './instrument'
import { isOwnClickWrapper, isOwnOpenBeacon, ownTrackedDestination } from './paths'
import { classifyOpen, tidyIp } from './classify'
import { isAccountSecurityTemplate, shouldTrackSend, trackedHtml } from './plan'
import { BOUNCE_WINDOW_MS, smtpDeliveryVerdict } from './delivery'

// The pure half of the site's own email tracking: the token, the rewriting,
// the rules for what is tracked and what is said about it afterwards. The
// routes and the database are tested beside this (handlers.test.ts,
// events.live.test.ts).

const SECRET = 's'.repeat(40)
const SITE = 'https://deskwell.co.uk'

describe('the token', () => {
  it('round-trips what it was given', () => {
    const token = signTrackingToken({ k: 'c', e: 'log1', m: 'unified-inbox', x: 'msg-1', u: 'https://deskwell.co.uk/quote/7' }, SECRET)
    expect(verifyTrackingToken(token, SECRET)).toEqual({ k: 'c', e: 'log1', m: 'unified-inbox', x: 'msg-1', u: 'https://deskwell.co.uk/quote/7' })
  })

  it('refuses a token whose destination has been edited', () => {
    const token = signTrackingToken({ k: 'c', e: 'log1', u: 'https://deskwell.co.uk/' }, SECRET)
    const [v, , sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ k: 'c', e: 'log1', u: 'https://evil.example/' })).toString('base64url')
    expect(verifyTrackingToken(`${v}.${forged}.${sig}`, SECRET)).toBeNull()
  })

  it('refuses one signed with another key', () => {
    const token = signTrackingToken({ k: 'o', e: 'log1' }, 'x'.repeat(40))
    expect(verifyTrackingToken(token, SECRET)).toBeNull()
  })

  it('refuses rubbish without throwing', () => {
    for (const junk of ['', 'v1', 'v1..', 'v2.a.b', 'v1.!!!.???', 'x'.repeat(5000), 'v1.e30.AAAA']) {
      expect(verifyTrackingToken(junk, SECRET)).toBeNull()
    }
  })

  it('will not carry a destination that is not a web address', () => {
    expect(() => signTrackingToken({ k: 'c', e: 'log1', u: 'javascript:alert(1)' }, SECRET)).toThrow()
  })
})

describe('rewriting a message', () => {
  const build = (html: string) => instrumentEmailHtml(html, {
    openUrl: `${SITE}/api/email/o/OPEN`,
    linkUrl: (to) => `${SITE}/api/email/c/${encodeURIComponent(to)}`,
  })

  it('tracks ordinary links and puts the picture before the end of the body', () => {
    const out = build('<html><body><p><a href="https://deskwell.co.uk/shop?a=1&amp;b=2">Shop</a></p></body></html>')
    expect(out.links).toBe(1)
    expect(out.html).toContain(`href="${SITE}/api/email/c/${encodeURIComponent('https://deskwell.co.uk/shop?a=1&b=2')}"`)
    expect(out.html.indexOf('/api/email/o/OPEN')).toBeLessThan(out.html.indexOf('</body>'))
  })

  it('appends the picture when there is no body tag', () => {
    const out = build('<p>Hello</p>')
    expect(out.html.startsWith('<p>Hello</p><img')).toBe(true)
  })

  it('leaves mailto, tel, anchors, relative links and unsubscribe links alone', () => {
    const html = [
      '<a href="mailto:sales@deskwell.co.uk">Email</a>',
      '<a href="tel:+441234">Ring</a>',
      '<a href="#top">Top</a>',
      '<a href="/shop">Shop</a>',
      '<a href="https://deskwell.co.uk/unsubscribe?t=1">Stop</a>',
      '<a href="https://deskwell.co.uk/p">Unsubscribe here</a>',
      '<a data-cactus-untracked href="https://deskwell.co.uk/raw">Raw</a>',
    ].join('')
    const out = build(html)
    expect(out.links).toBe(0)
    expect(out.html.startsWith(html)).toBe(true)
  })

  it('never wraps a link that is already tracked, ours or Brevo\'s', () => {
    expect(isTrackableLink(`${SITE}/api/email/c/v1.abc.def`)).toBe(false)
    expect(isTrackableLink('https://x.r.sendibt3.com/tr/cl/abc')).toBe(false)
    expect(isTrackableLink('https://x.r.sp1-brevo.net/mk/cl/f/abc')).toBe(false)
    expect(isTrackableLink('https://deskwell.co.uk/chairs')).toBe(true)
  })

  it('handles single-quoted and unquoted hrefs', () => {
    const out = build("<a href='https://a.example/x'>A</a><a href=https://b.example/y>B</a>")
    expect(out.links).toBe(2)
  })

  it('takes an old open picture of ours out of a quoted message', () => {
    const quoted = `<p>New</p><blockquote><img src="${SITE}/api/email/o/v1.old.sig" width="1"></blockquote>`
    expect(stripOwnOpenBeacons(quoted)).toBe('<p>New</p><blockquote></blockquote>')
    const out = build(quoted)
    expect(out.html.match(/\/api\/email\/o\//g)?.length).toBe(1)
    expect(out.html).toContain('/api/email/o/OPEN')
  })

  it('leaves other pictures alone', () => {
    const html = '<img src="https://deskwell.co.uk/media/chair.jpg">'
    expect(stripOwnOpenBeacons(html)).toBe(html)
  })
})

describe('recognising our own addresses', () => {
  it('knows the picture and the redirect, and nothing else', () => {
    expect(isOwnOpenBeacon(`${SITE}/api/email/o/v1.a.b`)).toBe(true)
    expect(isOwnClickWrapper(`${SITE}/api/email/c/v1.a.b`)).toBe(true)
    expect(isOwnOpenBeacon(`${SITE}/api/email/c/v1.a.b`)).toBe(false)
    expect(isOwnOpenBeacon(`${SITE}/media/o.png`)).toBe(false)
    expect(isOwnOpenBeacon('cid:image001')).toBe(false)
    expect(isOwnOpenBeacon('')).toBe(false)
  })

  it('sees through Gmail\'s picture proxy', () => {
    expect(isOwnOpenBeacon(`https://ci3.googleusercontent.com/meips/ADKq#${SITE}/api/email/o/v1.a.b`)).toBe(true)
  })

  it('reads where one of our links really goes', () => {
    const token = signTrackingToken({ k: 'c', e: 'log1', u: 'https://deskwell.co.uk/quote/7?x=1' }, SECRET)
    expect(ownTrackedDestination(`${SITE}/api/email/c/${token}`)).toBe('https://deskwell.co.uk/quote/7?x=1')
    expect(ownTrackedDestination('https://deskwell.co.uk/quote/7')).toBeNull()
    expect(ownTrackedDestination(`${SITE}/api/email/c/nonsense`)).toBeNull()
  })
})

describe('what an open is worth', () => {
  it('counts Apple\'s prefetch and office scanners as machines', () => {
    expect(classifyOpen('Mozilla/5.0')).toBe('proxy_open')
    expect(classifyOpen('')).toBe('proxy_open')
    expect(classifyOpen(null)).toBe('proxy_open')
    expect(classifyOpen('Mimecast Security Scanner')).toBe('proxy_open')
  })

  it('counts a real mail program and Gmail\'s proxy as opens', () => {
    expect(classifyOpen('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36')).toBe('opened')
    expect(classifyOpen('Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)')).toBe('opened')
  })

  it('keeps only real addresses', () => {
    expect(tidyIp('81.2.69.160')).toBe('81.2.69.160')
    expect(tidyIp('2001:DB8::1')).toBe('2001:db8::1')
    expect(tidyIp('unknown')).toBeNull()
    expect(tidyIp('999.1.1.1')).toBeNull()
    expect(tidyIp('<script>')).toBeNull()
  })
})

describe('what gets tracked', () => {
  const base = {
    tracking: undefined,
    transport: 'smtp' as const,
    html: '<p>Hi</p>',
    siteEnabled: true,
    secret: SECRET,
    siteUrl: SITE,
  }

  it('tracks an ordinary SMTP send', () => {
    expect(shouldTrackSend(base)).toBe(true)
    expect(shouldTrackSend({ ...base, tracking: { ref: 'm1' } })).toBe(true)
  })

  it('never tracks Brevo mail, which counts its own', () => {
    expect(shouldTrackSend({ ...base, transport: 'brevo' })).toBe(false)
  })

  it('never tracks sign-in and account-security mail', () => {
    expect(shouldTrackSend({ ...base, templateKey: 'auth.login-code' })).toBe(false)
    expect(shouldTrackSend({ ...base, headers: { 'x-cactus-template': 'auth.recovery-link' } })).toBe(false)
    expect(shouldTrackSend({ ...base, templateKey: 'member.magic-link' })).toBe(false)
    expect(isAccountSecurityTemplate('shop.order-confirmed')).toBe(false)
  })

  it('respects the caller, the site switch, and a missing key or address', () => {
    expect(shouldTrackSend({ ...base, tracking: false })).toBe(false)
    expect(shouldTrackSend({ ...base, siteEnabled: false })).toBe(false)
    expect(shouldTrackSend({ ...base, secret: null })).toBe(false)
    expect(shouldTrackSend({ ...base, siteUrl: null })).toBe(false)
    expect(shouldTrackSend({ ...base, html: '   ' })).toBe(false)
  })

  it('signs addresses the routes will accept, naming the send and the caller\'s ref', () => {
    const { html, links } = trackedHtml({
      html: '<a href="https://deskwell.co.uk/q/1">Quote</a>',
      emailLogId: 'log42',
      moduleName: 'unified-inbox',
      ref: 'msg-9',
      secret: SECRET,
      siteUrl: `${SITE}/`,
    })
    expect(links).toBe(1)
    const click = /\/api\/email\/c\/([^"]+)"/.exec(html)![1]!
    const open = /\/api\/email\/o\/([^"]+)"/.exec(html)![1]!
    expect(verifyTrackingToken(click, SECRET)).toEqual({ k: 'c', e: 'log42', m: 'unified-inbox', x: 'msg-9', u: 'https://deskwell.co.uk/q/1' })
    expect(verifyTrackingToken(open, SECRET)).toEqual({ k: 'o', e: 'log42', m: 'unified-inbox', x: 'msg-9' })
    expect(html).not.toContain('//api/email')
  })

  it('drops a ref that will not travel safely rather than failing the send', () => {
    const { html } = trackedHtml({ html: '<p>x</p>', emailLogId: 'log1', ref: 'has spaces in it', secret: SECRET, siteUrl: SITE })
    const open = /\/api\/email\/o\/([^"]+)"/.exec(html)![1]!
    expect(verifyTrackingToken(open, SECRET)).toEqual({ k: 'o', e: 'log1' })
  })
})

describe('what an SMTP send can honestly claim', () => {
  const sentAt = new Date('2026-09-01T10:00:00Z')

  it('is accepted, then quiet, never delivered', () => {
    expect(smtpDeliveryVerdict({ sentAt, bouncedAt: null, now: new Date(sentAt.getTime() + 60_000) })).toBe('accepted')
    expect(smtpDeliveryVerdict({ sentAt, bouncedAt: null, now: new Date(sentAt.getTime() + BOUNCE_WINDOW_MS) })).toBe('no-bounce')
  })

  it('says so when something came back', () => {
    expect(smtpDeliveryVerdict({ sentAt, bouncedAt: sentAt, now: sentAt })).toBe('bounced')
    expect(smtpDeliveryVerdict({ sentAt, bouncedAt: null, deferredAt: sentAt, now: sentAt })).toBe('delayed')
  })
})
