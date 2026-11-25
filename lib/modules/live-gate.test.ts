import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const names = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/modules/live-status', () => ({ getInstalledModuleNames: names.get }))

import { isModuleLive } from '@/lib/modules/live-gate'
import { dispatchModuleApi, resolveModulePage } from '@/lib/modules/router'
import { dispatchModulePublicRoute, resolveModulePublicPage } from '@/lib/modules/router.public'
import { resolveModuleIndexPage, resolveModuleRootSlugPage } from '@/lib/modules/router.public-slug'

// A switched-off module keeps its compiled code until the next deploy, so the
// generated router has to refuse it. The gate must never fail closed: a database
// blip turning every shop page into a cacheable 404 is worse than the bug.

const LIB = path.join(__dirname)
// A module that really has API routes in this checkout, whatever the install set.
const apiModule = /const API_ROUTES[^\n]*\n\s+'([^']+)': \[/.exec(readFileSync(path.join(LIB, 'router.ts'), 'utf8'))?.[1]
const publicBase = /const PUBLIC_BASE_MODULES[^=]*= \{"([^"]+)":"([^"]+)"/.exec(readFileSync(path.join(LIB, 'router.public.ts'), 'utf8'))

beforeEach(() => {
  names.get.mockReset()
})

describe('isModuleLive', () => {
  it('is true only for a module in the installed set', async () => {
    names.get.mockResolvedValue(new Set(['shop']))
    await expect(isModuleLive('shop')).resolves.toBe(true)
    await expect(isModuleLive('contact-form')).resolves.toBe(false)
  })

  it('fails open when the status read throws', async () => {
    names.get.mockImplementation(() => { throw new Error('db down') })
    await expect(isModuleLive('contact-form')).resolves.toBe(true)
  })
})

describe.skipIf(!apiModule)('generated router gate', () => {
  it('answers a switched-off module API exactly like an unknown module', async () => {
    names.get.mockResolvedValue(new Set())
    const ctx = { params: Promise.resolve({ module: apiModule!, path: ['anything'] }) }
    const res = await dispatchModuleApi('POST', new Request('http://x/api/m/x/anything', { method: 'POST' }), ctx)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Module not found')
  })

  it('dispatches (reaches route matching) when the status read throws', async () => {
    names.get.mockImplementation(() => { throw new Error('db down') })
    const ctx = { params: Promise.resolve({ module: apiModule!, path: ['__no_such_route__'] }) }
    const res = await dispatchModuleApi('GET', new Request('http://x/api/m/x/y'), ctx)
    // Past the gate: the "no route matched" answer, not the "module not found" one.
    expect(await res.text()).toBe('Not found')
  })

  it('gives no admin page for a switched-off module', async () => {
    names.get.mockResolvedValue(new Set())
    await expect(resolveModulePage(apiModule!, [])).resolves.toBeNull()
  })

  it.skipIf(!publicBase)('gives no public page, feed or index for a switched-off module', async () => {
    names.get.mockResolvedValue(new Set())
    const base = publicBase![1]!
    await expect(resolveModulePublicPage(base, [])).resolves.toBeNull()
    await expect(dispatchModulePublicRoute(base, ['feed.xml'], 'GET', new Request('http://x/'))).resolves.toBeNull()
    await expect(resolveModuleIndexPage(base)).resolves.toBeNull()
    await expect(resolveModuleRootSlugPage('some-slug')).resolves.toBeNull()
  })
})
