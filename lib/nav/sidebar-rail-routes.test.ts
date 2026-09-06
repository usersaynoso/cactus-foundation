import { describe, it, expect } from 'vitest'
import { isSidebarRailRoute } from './sidebar-rail-routes'

// The admin path is configurable, so the predicate only ever sees the tail of the
// route and must not depend on the prefix.
const ADMIN = '/cactus-admin'
const CUID = 'clx8h2k9p0001abcd1234efgh'

describe('isSidebarRailRoute', () => {
  it('matches the inbox on any admin path', () => {
    expect(isSidebarRailRoute(`${ADMIN}/inbox`)).toBe(true)
    expect(isSidebarRailRoute('/secret-door/inbox')).toBe(true)
  })

  it('still matches the Puck editors', () => {
    expect(isSidebarRailRoute(`${ADMIN}/pages/${CUID}`)).toBe(true)
    expect(isSidebarRailRoute(`${ADMIN}/appearance/header`)).toBe(true)
  })

  it('leaves other admin screens alone', () => {
    expect(isSidebarRailRoute(`${ADMIN}`)).toBe(false)
    expect(isSidebarRailRoute(`${ADMIN}/pages`)).toBe(false)
    expect(isSidebarRailRoute(`${ADMIN}/media`)).toBe(false)
    // A module slug that merely ends in "inbox" is not the inbox screen.
    expect(isSidebarRailRoute(`${ADMIN}/m/unified-inbox`)).toBe(false)
    expect(isSidebarRailRoute(`${ADMIN}/m/unified-inbox/settings`)).toBe(false)
  })
})
