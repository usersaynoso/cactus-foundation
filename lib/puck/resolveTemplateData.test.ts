import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/menu/resolve', () => ({
  resolveMenu: vi.fn(async () => [{ id: 'm1', label: 'About', href: '/about', openInNewTab: false }]),
  resolveMainMenu: vi.fn(async () => [{ id: 'm0', label: 'Home', href: '/', openInNewTab: false }]),
}))
vi.mock('@/lib/members/paths', () => ({ getMemberAreaPath: () => 'account' }))

const { needsTemplateData, resolveTemplateData } = await import('./resolveTemplateData')

const CTX = { siteName: 'Deskside', logoUrl: '/logo.png', logoDarkUrl: null, isLoggedIn: false, adminPath: 'hq' }

describe('needsTemplateData', () => {
  it('is false for a page of ordinary blocks, so the page render skips the copy and the lookups', () => {
    expect(needsTemplateData({
      root: { props: {} },
      content: [{ type: 'Heading', props: { id: 'h', text: 'Hi' } }, { type: 'Grid2', props: { id: 'g', col1: [{ type: 'TextBlock', props: { id: 't' } }] } }],
      zones: {},
    })).toBe(false)
    expect(needsTemplateData(null)).toBe(false)
  })

  it('finds a Site block at the top level, inside a slot and inside a legacy zone', () => {
    expect(needsTemplateData({ content: [{ type: 'MenuBlock', props: { id: 'm' } }] })).toBe(true)
    expect(needsTemplateData({ content: [{ type: 'Grid2', props: { id: 'g', col1: [{ type: 'SiteLogo', props: { id: 's' } }] } }] })).toBe(true)
    expect(needsTemplateData({ content: [], zones: { 'g:col': [{ type: 'Copyright', props: { id: 'c' } }] } })).toBe(true)
  })
})

describe('resolveTemplateData', () => {
  it('fills a Menu and a Site Logo nested in a slot, and leaves the stored data alone', async () => {
    const raw = {
      root: { props: {} },
      content: [{ type: 'Grid2', props: { id: 'g', col1: [{ type: 'MenuBlock', props: { id: 'm' } }, { type: 'SiteLogo', props: { id: 's' } }] } }],
      zones: {},
    }
    const out = await resolveTemplateData(raw, CTX) as unknown as typeof raw
    const [menu, logo] = out.content[0]!.props.col1 as Array<{ props: Record<string, unknown> }>
    expect(menu!.props.resolvedItems).toEqual([{ id: 'm0', label: 'Home', href: '/', openInNewTab: false }])
    expect(logo!.props.logoUrl).toBe('/logo.png')
    expect(logo!.props.siteName).toBe('Deskside')
    expect((raw.content[0]!.props.col1[0] as { props: Record<string, unknown> }).props.resolvedItems).toBeUndefined()
  })
})
