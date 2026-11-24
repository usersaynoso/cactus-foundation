import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// PATCH /api/admin/config, homepage fields only: a page and module content are
// alternatives, so choosing one clears the other, and the root route is
// revalidated whenever either moves.

const state = vi.hoisted(() => ({ updates: [] as Array<Record<string, unknown>> }))
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/auth/session', () => ({ getSessionFromCookie: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/permissions/check', () => ({ hasPermission: vi.fn(async () => true) }))
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    siteConfig: {
      findUnique: vi.fn(async () => ({})),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.updates.push(data); return data }),
    },
  },
}))
vi.mock('@/lib/config/site', () => ({ isBlocklisted: () => false, invalidateSiteConfigCache: vi.fn() }))
vi.mock('@/lib/config/edge-config', () => ({ syncToEdgeConfig: vi.fn(async () => {}), waitForAdminPathPropagation: vi.fn(async () => {}) }))
vi.mock('@/lib/cache/page-store/signal', () => ({ invalidatePageStore: vi.fn() }))
vi.mock('@/lib/cache/cdn-purge', () => ({ purgeCdnEverything: vi.fn(async () => {}) }))
vi.mock('@/lib/media/upload', () => ({ markMediaOptimised: vi.fn(async () => {}) }))

const { PATCH } = await import('./route')

function patch(body: Record<string, unknown>) {
  return PATCH(new NextRequest('https://example.test/api/admin/config', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }))
}

const MODULE = { homepageModuleId: 'tg-finance', homepageEntityKind: 'screens', homepageEntityId: 'money' }
const NO_MODULE = { homepageModuleId: null, homepageEntityKind: null, homepageEntityId: null }

beforeEach(() => {
  state.updates = []
  revalidatePath.mockClear()
})

describe('PATCH /api/admin/config: homepage', () => {
  it('stores module content and clears the page', async () => {
    const res = await patch({ homepageId: null, ...MODULE })
    expect(res.status).toBe(200)
    expect(state.updates[0]).toMatchObject({ homepageId: null, ...MODULE })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('stores a page and clears module content', async () => {
    await patch({ homepageId: 'page1', ...NO_MODULE })
    expect(state.updates[0]).toMatchObject({ homepageId: 'page1', ...NO_MODULE })
  })

  it('a page sent alone, as an older admin screen does, still clears module content', async () => {
    await patch({ homepageId: 'page1' })
    expect(state.updates[0]).toMatchObject({ homepageId: 'page1', ...NO_MODULE })
  })

  it('refuses both at once', async () => {
    const res = await patch({ homepageId: 'page1', ...MODULE })
    expect(res.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses half a module target', async () => {
    const res = await patch({ homepageModuleId: 'tg-finance', homepageEntityKind: null, homepageEntityId: null })
    expect(res.status).toBe(400)
    expect(state.updates).toHaveLength(0)
  })

  it('leaves the homepage alone when the payload does not mention it', async () => {
    await patch({ siteName: 'Taylor-Guest' })
    expect(state.updates[0]).toEqual({ siteName: 'Taylor-Guest' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
