import { beforeEach, describe, expect, it, vi } from 'vitest'

// The inline font stylesheet sits on the render path of every public page, so the
// two ways it can go wrong are both expensive and both invisible to typecheck:
// asking Google on every request (a network round trip in front of every page,
// or one per page view during an outage), and writing something into the page
// that is not a font stylesheet. These pin both.

type FontFaceCssModule = typeof import('./font-face-css')

// Module state is the whole point of the file, so each test gets a fresh copy.
async function freshModule(): Promise<FontFaceCssModule> {
  vi.resetModules()
  return import('./font-face-css')
}

const HREF = '/api/fonts/css?family=Inter%3Awght%40400%3B500%3B600%3B700&display=swap'

// The shape Google's css2 answer takes, already rewritten to this site's file route.
const REWRITTEN_CSS = `/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/api/fonts/file/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153;
}
`

// What Google itself sends, before the rewrite.
const UPSTREAM_CSS = REWRITTEN_CSS.replace('/api/fonts/file/', 'https://fonts.gstatic.com/')

function okFetch(body: string = UPSTREAM_CSS) {
  return vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/css' } })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('fontFacesKeyForHref', () => {
  it('keys a proxied stylesheet address by its sanitised query', async () => {
    const mod = await freshModule()
    expect(mod.fontFacesKeyForHref(HREF)).toBe('family=Inter%3Awght%40400%3B500%3B600%3B700&display=swap')
  })

  it('refuses anything that is not this site\'s stylesheet route', async () => {
    const mod = await freshModule()
    expect(mod.fontFacesKeyForHref('https://fonts.googleapis.com/css2?family=Inter')).toBeNull()
    expect(mod.fontFacesKeyForHref('/api/fonts/css?nothing=here')).toBeNull()
  })
})

describe('inlineFontFaceCssSchema', () => {
  it('accepts a rewritten font stylesheet', async () => {
    const mod = await freshModule()
    expect(mod.inlineFontFaceCssSchema.safeParse(REWRITTEN_CSS).success).toBe(true)
  })

  it('refuses a "<", which could close the <style> element and start markup', async () => {
    const mod = await freshModule()
    expect(mod.inlineFontFaceCssSchema.safeParse(`${REWRITTEN_CSS}</style><script>alert(1)</script>`).success).toBe(false)
  })

  it('refuses a url that is not the site\'s own font file route', async () => {
    const mod = await freshModule()
    expect(mod.inlineFontFaceCssSchema.safeParse(UPSTREAM_CSS).success).toBe(false)
    expect(mod.inlineFontFaceCssSchema.safeParse(REWRITTEN_CSS.replace('url(/api', "url('//evil.example/api")).success).toBe(false)
  })

  it('refuses an @import and a stylesheet with no font faces', async () => {
    const mod = await freshModule()
    expect(mod.inlineFontFaceCssSchema.safeParse(`@import url(/api/fonts/file/x.css);\n${REWRITTEN_CSS}`).success).toBe(false)
    expect(mod.inlineFontFaceCssSchema.safeParse('body { color: red }').success).toBe(false)
  })
})

describe('readInlineFontFaces and refreshInlineFontFaces', () => {
  it('links on a cold instance and asks for a refresh, without touching the network itself', async () => {
    const mod = await freshModule()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(mod.readInlineFontFaces(HREF)).toEqual({ css: null, needsRefresh: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('inlines the rewritten rules once a refresh has landed, and stops asking', async () => {
    const mod = await freshModule()
    const fetchImpl = okFetch()
    await mod.refreshInlineFontFaces(HREF, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://fonts.googleapis.com/css2?family=Inter%3Awght%40400%3B500%3B600%3B700&display=swap',
    )
    expect(mod.readInlineFontFaces(HREF)).toEqual({ css: REWRITTEN_CSS, needsRefresh: false })
  })

  it('shares one upstream request between renders that ask at the same time', async () => {
    const mod = await freshModule()
    const fetchImpl = okFetch()
    await Promise.all([
      mod.refreshInlineFontFaces(HREF, fetchImpl),
      mod.refreshInlineFontFaces(HREF, fetchImpl),
      mod.refreshInlineFontFaces(HREF, fetchImpl),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not ask again while a refresh is still in flight', async () => {
    const mod = await freshModule()
    let release: (() => void) | undefined
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => {
        release = () => resolve(new Response(UPSTREAM_CSS, { status: 200 }))
      }),
    ) as unknown as typeof fetch
    const job = mod.refreshInlineFontFaces(HREF, fetchImpl)
    expect(mod.readInlineFontFaces(HREF).needsRefresh).toBe(false)
    release?.()
    await job
  })

  it('backs off after a failure instead of asking Google on every page view', async () => {
    const mod = await freshModule()
    let clock = 1_000_000
    const failing = vi.fn(async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    await mod.refreshInlineFontFaces(HREF, failing, () => clock)
    expect(mod.readInlineFontFaces(HREF, clock + 1000)).toEqual({ css: null, needsRefresh: false })
    clock += mod.FONT_FACES_RETRY_AFTER_MS + 1
    expect(mod.readInlineFontFaces(HREF, clock)).toEqual({ css: null, needsRefresh: true })
  })

  it('keeps serving a stale copy while asking for a fresh one after a day', async () => {
    const mod = await freshModule()
    const start = 5_000_000
    await mod.refreshInlineFontFaces(HREF, okFetch(), () => start)
    const later = start + mod.FONT_FACES_FRESH_FOR_MS + 1
    expect(mod.readInlineFontFaces(HREF, later)).toEqual({ css: REWRITTEN_CSS, needsRefresh: true })
  })

  it('keeps linking when the upstream answer fails the inline checks', async () => {
    const mod = await freshModule()
    await mod.refreshInlineFontFaces(HREF, okFetch(`${UPSTREAM_CSS}\n/* </style> */`))
    expect(mod.readInlineFontFaces(HREF).css).toBeNull()
  })
})

describe('holdFontFaceCss', () => {
  it('holds what the stylesheet route already fetched, so a page on that instance can inline it', async () => {
    const mod = await freshModule()
    const params = new URLSearchParams('family=Inter%3Awght%40400%3B500%3B600%3B700&display=swap')
    expect(mod.holdFontFaceCss(params, REWRITTEN_CSS)).toBe(true)
    expect(mod.readInlineFontFaces(HREF).css).toBe(REWRITTEN_CSS)
  })
})
