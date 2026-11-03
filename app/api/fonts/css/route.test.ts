import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { GET } from './route'

const css = (family: string) =>
  `@font-face {\n  font-family: '${family}';\n  src: url(https://fonts.gstatic.com/s/x/v1/${family}.woff2) format('woff2');\n}\n`

// A family name nobody else's test uses, so the held copy is this test's alone.
const fresh = () => `Test${randomUUID().replace(/[^a-z]/gi, '').slice(0, 12)}`

function call(family: string) {
  return GET(new NextRequest(`https://site.example/api/fonts/css?family=${family}:wght@400;700&display=swap`))
}

afterEach(() => vi.unstubAllGlobals())

describe('font stylesheet route', () => {
  it('rewrites the files onto this site and caches for days, not a year', async () => {
    const family = fresh()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(css(family), { status: 200 })))
    const res = await call(family)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('/api/fonts/file/s/x/v1/')
    expect(body).not.toContain('fonts.gstatic.com')
    expect(res.headers.get('cache-control')).not.toContain('immutable')
  })

  it('answers from its held copy without waiting on Google', async () => {
    const family = fresh()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(css(family), { status: 200 })))
    await call(family)
    // Google now hangs for ever: the held copy must answer regardless.
    const hanging = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', hanging)
    const res = await call(family)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(family)
    expect(hanging).not.toHaveBeenCalled()
  })

  it('sends the browser to Google when it has never had a copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    const res = await call(fresh())
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?/)
  })

  it('refuses a stylesheet that would still send the browser to Google for a file', async () => {
    const family = fresh()
    const odd = `@font-face { font-family: '${family}'; src: url(//fonts.gstatic.com/s/x/v1/odd.woff2); }`
    vi.stubGlobal('fetch', vi.fn(async () => new Response(odd, { status: 200 })))
    const res = await call(family)
    expect(res.status).toBe(302)
  })
})
