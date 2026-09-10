import { describe, it, expect } from 'vitest'
import { adminScreenTitle, resolveModulePageTitle, type ModuleManifestNav } from './admin-menu'

// Two manifests, so the resolver has to pick the right module's links and the
// longest matching one within it.
const SHOP: ModuleManifestNav = {
  navEntries: [
    { label: 'Catalogue', path: '/m/shop/products' },
    { label: 'Trading', path: '/m/shop/orders' },
  ],
  navGroupLabel: 'Shop',
}
const BOOKKEEPING: ModuleManifestNav = {
  navEntries: [{ label: 'Bookkeeping', path: '/m/uk-bookkeeping/overview' }],
}
const MANIFESTS = [SHOP, BOOKKEEPING, null]

describe('resolveModulePageTitle', () => {
  it('uses the sidebar link the screen sits under', () => {
    expect(resolveModulePageTitle('shop', ['products'], MANIFESTS)).toBe('Catalogue')
    expect(resolveModulePageTitle('uk-bookkeeping', ['overview'], MANIFESTS)).toBe('Bookkeeping')
  })

  it('keeps the section name on a record screen below the link', () => {
    expect(resolveModulePageTitle('shop', ['orders', 'clx8h2k9p0001abcd'], MANIFESTS)).toBe('Trading')
  })

  it('never matches a link that merely shares a path prefix as text', () => {
    // "/m/shop/order" must not be satisfied by the "/m/shop/orders" link.
    expect(resolveModulePageTitle('shop', ['order'], MANIFESTS)).toBe('Order')
  })

  it('falls back to the last segment that names something', () => {
    expect(resolveModulePageTitle('shop', ['back-in-stock'], [])).toBe('Back In Stock')
    expect(resolveModulePageTitle('shop', ['customers', 'clx8h2k9p0001abcd'], [])).toBe('Customers')
  })

  it('falls back to the module itself when the path is all ids', () => {
    expect(resolveModulePageTitle('uk-bookkeeping', [], [])).toBe('Uk Bookkeeping')
    expect(resolveModulePageTitle('product-addons-for-shop', [], [])).toBe('Product Addons')
  })

  it('never returns an empty title', () => {
    for (const path of [[], ['12345'], ['clx8h2k9p0001abcd1234efgh']]) {
      expect(resolveModulePageTitle('shop', path, []).length).toBeGreaterThan(0)
    }
  })
})

describe('adminScreenTitle', () => {
  it('puts the section first', () => {
    expect(adminScreenTitle('Users')).toBe('Users — Admin')
  })

  it('names the tab a heavily-tabbed screen is showing, in sentence case', () => {
    // Sentence case, not Title Case: the id stands in for a label somebody wrote.
    expect(adminScreenTitle('Users', 'pending-approval')).toBe('Users: Pending approval — Admin')
    expect(adminScreenTitle('Inbox', 'contact-form')).toBe('Inbox: Contact form — Admin')
  })

  it('ignores an absent or blank tab', () => {
    expect(adminScreenTitle('Settings', undefined)).toBe('Settings — Admin')
    expect(adminScreenTitle('Settings', '  ')).toBe('Settings — Admin')
  })
})
