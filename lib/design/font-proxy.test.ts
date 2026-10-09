import { describe, it, expect } from 'vitest'
import {
  FONT_FILE_PATH,
  KIT_FONT_FILE_PATH,
  isSafeFontFilePath,
  proxiedFontHref,
  rewriteFontFileUrls,
  sanitiseFontQuery,
  sanitiseKitFontQuery,
} from './font-proxy'

// These two guards are the whole security surface of serving fonts from our own
// domain: one decides which Google stylesheet we will fetch, the other which Google
// file we will hand back from our own origin. Get either wrong and the site becomes
// an open proxy - a way to make requests look as though they came from the shop, and
// to serve arbitrary bytes from a domain the visitor's browser trusts.
//
// Nothing else can catch that. Both functions typecheck and lint perfectly happily
// while waving through a `..` or a second host.

describe('sanitiseFontQuery', () => {
  it('keeps a family and its weights', () => {
    const q = sanitiseFontQuery(new URLSearchParams('family=Inter:wght@400;700&display=swap'))
    expect(q?.getAll('family')).toEqual(['Inter:wght@400;700'])
    expect(q?.get('display')).toBe('swap')
  })

  it('keeps several families, which is how one request serves a whole page', () => {
    const q = sanitiseFontQuery(new URLSearchParams('family=Inter:wght@400&family=Fraunces:wght@500;600'))
    expect(q?.getAll('family')).toEqual(['Inter:wght@400', 'Fraunces:wght@500;600'])
  })

  it('accepts the variable-axis shapes Google actually serves', () => {
    const q = sanitiseFontQuery(new URLSearchParams('family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700'))
    expect(q?.getAll('family')).toHaveLength(1)
  })

  it('refuses a query with no family at all, rather than asking Google for nothing', () => {
    expect(sanitiseFontQuery(new URLSearchParams('display=swap'))).toBeNull()
    expect(sanitiseFontQuery(new URLSearchParams(''))).toBeNull()
  })

  it('drops a family carrying anything but a name and weights', () => {
    // The shapes that would make this an open proxy: a path, a host, a query of
    // its own.
    for (const bad of ['../../secret', 'Inter&callback=x', 'https://evil.test/a', 'Inter:wght@400)/../..']) {
      expect(sanitiseFontQuery(new URLSearchParams([['family', bad]]))).toBeNull()
    }
  })

  it('drops every parameter it does not understand', () => {
    const q = sanitiseFontQuery(new URLSearchParams('family=Inter&text=hello&effect=shadow'))
    expect([...(q?.keys() ?? [])].sort()).toEqual(['display', 'family'])
  })

  it('forces a sane display value rather than passing one through', () => {
    expect(sanitiseFontQuery(new URLSearchParams('family=Inter&display=nonsense'))?.get('display')).toBe('swap')
  })
})

describe('isSafeFontFilePath', () => {
  it('accepts the shape Google mints', () => {
    expect(isSafeFontFilePath('s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2')).toBe(true)
  })

  it('refuses anything that could climb out of the font tree or name another host', () => {
    for (const bad of [
      '',
      '/etc/passwd',
      's/../../../etc/passwd',
      'https://evil.test/a.woff2',
      'user@evil.test/a.woff2',
      's\\..\\a.woff2',
      's/inter/v13/a.woff2?x=1',
      's/inter/v13/a woff2',
    ]) {
      expect(isSafeFontFilePath(bad), bad).toBe(false)
    }
  })

  it('refuses an absurdly long path', () => {
    expect(isSafeFontFilePath('s/' + 'a'.repeat(400) + '.woff2')).toBe(false)
  })
})

describe('rewriteFontFileUrls', () => {
  it('points every font file at this site instead of Google', () => {
    const css = `@font-face{font-family:'Inter';src:url(https://fonts.gstatic.com/s/inter/v13/abc.woff2) format('woff2');}`
    const out = rewriteFontFileUrls(css)
    expect(out).not.toContain('fonts.gstatic.com')
    expect(out).toContain(`${FONT_FILE_PATH}/s/inter/v13/abc.woff2`)
  })

  it('rewrites every face in the file, not just the first', () => {
    const css = [
      'src:url(https://fonts.gstatic.com/s/a/1.woff2)',
      'src:url(https://fonts.gstatic.com/s/b/2.woff2)',
    ].join('\n')
    expect(rewriteFontFileUrls(css).match(/fonts\.gstatic\.com/g)).toBeNull()
  })

  it('leaves the rest of the stylesheet alone', () => {
    const css = `/* latin */\n@font-face{font-display:swap;unicode-range:U+0000-00FF;}`
    expect(rewriteFontFileUrls(css)).toBe(css)
  })
})

describe('proxiedFontHref', () => {
  it('is a path on this site, never an absolute url', () => {
    const href = proxiedFontHref(sanitiseFontQuery(new URLSearchParams('family=Inter:wght@400'))!)
    // A server render has no idea what host it is answering on, so the link has to
    // be relative - and it must not accidentally point back at Google.
    expect(href.startsWith('/')).toBe(true)
    expect(href).not.toContain('fonts.googleapis.com')
  })
})

// Google sometimes answers with `l/font?kit=…` urls instead of `/s/<family>/….woff2`
// ones. On 2026-10-09 a fresh deployment got that shape and every face on the site
// 400'd, so both halves are pinned here: the url keeps its query through the
// rewrite, and the file route's query guard lets Google's three parameters through
// and nothing else.
describe('kit-shaped font urls', () => {
  const KIT = 'kit=UcCB3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfU5NJeWUdIOjBeTGiXZdND2MVsiEu&skey=c491285d6722e4fa&v=v20'

  it('rewrites a kit url onto the file route with its query intact', () => {
    const css = `@font-face{src:url(https://fonts.gstatic.com/l/font?${KIT}) format('woff2');}`
    expect(rewriteFontFileUrls(css)).toContain(`url(${FONT_FILE_PATH}/${KIT_FONT_FILE_PATH}?${KIT})`)
  })

  it('accepts the path the file route sees for one', () => {
    expect(isSafeFontFilePath(KIT_FONT_FILE_PATH)).toBe(true)
  })

  it("keeps Google's three parameters", () => {
    const q = sanitiseKitFontQuery(new URLSearchParams(KIT))
    expect(q?.toString()).toBe(KIT)
  })

  it('drops anything else rather than forwarding it to Google', () => {
    const q = sanitiseKitFontQuery(new URLSearchParams(`${KIT}&url=https://evil.example`))
    expect(q?.has('url')).toBe(false)
    expect(q?.get('kit')).toBeTruthy()
  })

  it('refuses a query with no kit, or a value that is not a plain token', () => {
    expect(sanitiseKitFontQuery(new URLSearchParams('skey=abc&v=v20'))).toBeNull()
    expect(sanitiseKitFontQuery(new URLSearchParams('kit=../../etc'))).toBeNull()
    expect(sanitiseKitFontQuery(new URLSearchParams('kit=a&v=v20%2F..'))).toBeNull()
  })
})
