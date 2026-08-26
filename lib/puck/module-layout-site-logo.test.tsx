import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getModuleLayoutPuckConfig } from '@/lib/puck/config'

// The letterhead on a document layout - the invoice, the quote - is core's own
// SiteLogo block rather than a picture field inside each module. Two things have
// to hold for that, and neither of them fails loudly:
//
//  1. the block has to be OFFERED on a module layout at all. Module layouts take
//     their component set from a fixed list of categories, and 'site' is not one
//     of them; SiteLogo is added back by name. Drop that and the block vanishes
//     from the picker AND from the render path, and a published invoice quietly
//     loses its logo with a 200 and no error anywhere.
//
//  2. the published render has to know the site's logo. Everywhere else that is
//     resolveTemplateData's job, and module layouts never go through it - so the
//     RSC half fetches its own. Miss it and every document prints the site name
//     where the logo should be, which reads as "the logo is broken" rather than
//     as "a prop was undefined".

vi.mock('@/lib/config/site', () => ({
  getSiteConfig: async () => ({ siteName: 'Deskwell', logoMediaId: 'm1', logoDarkMediaId: null }),
}))
vi.mock('@/lib/db/prisma', () => ({
  prisma: { media: { findUnique: async () => ({ url: 'https://media.example.com/logo.svg' }) } },
}))

const DOCUMENT_LAYOUTS = ['shopInvoice', 'quoteDocument']

describe('the Site Logo block reaches document layouts', () => {
  it.each(DOCUMENT_LAYOUTS)('%s offers it in the picker', (layoutType) => {
    const config = getModuleLayoutPuckConfig(layoutType)
    expect(Object.keys(config.components)).toContain('SiteLogo')
    expect((config.categories as Record<string, { components: string[] }>).site?.components).toContain('SiteLogo')
  })

  it.each(DOCUMENT_LAYOUTS)('%s renders it with the site\'s own logo', async (layoutType) => {
    const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
    const components = getModuleLayoutPuckRscConfig(layoutType).components as Record<string, { render: (p: unknown) => unknown } | undefined>
    const def = components.SiteLogo
    if (!def) throw new Error(`${layoutType} does not register SiteLogo on the published render path`)
    // One level of async: the render returns an element whose component awaits
    // the branding. Unwrapped by hand rather than through a renderer, because
    // renderToStaticMarkup cannot await.
    const element = def.render({ id: 'logo-1' }) as { type: (p: unknown) => Promise<React.ReactElement>; props: unknown }
    const resolved = await element.type(element.props)
    const html = renderToStaticMarkup(resolved)
    expect(html).toContain('https://media.example.com/logo.svg')
  })
})
