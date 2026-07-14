import { describe, it, expect } from 'vitest'
import { isPuckEditorRoute } from './editor-routes'

// The admin path is configurable, so the predicate only ever sees the tail of the
// route and must not depend on the prefix.
const ADMIN = '/cactus-admin'
const CUID = 'clx8h2k9p0001abcd1234efgh'

describe('isPuckEditorRoute', () => {
  it('matches the page and layout editors', () => {
    expect(isPuckEditorRoute(`${ADMIN}/pages/${CUID}`)).toBe(true)
    expect(isPuckEditorRoute(`${ADMIN}/layouts/${CUID}`)).toBe(true)
    expect(isPuckEditorRoute('/secret-door/layouts/' + CUID)).toBe(true)
  })

  it('leaves the create screens alone', () => {
    // Both are ordinary forms/pickers. Treating them as editors strips their
    // padding and locks document scroll, which hides half the starter templates.
    expect(isPuckEditorRoute(`${ADMIN}/pages/new`)).toBe(false)
    expect(isPuckEditorRoute(`${ADMIN}/layouts/new`)).toBe(false)
  })

  it('does not mistake an id that merely starts with "new" for the create screen', () => {
    expect(isPuckEditorRoute(`${ADMIN}/layouts/newsletter-header`)).toBe(true)
  })

  it('leaves the list screens and unrelated admin pages alone', () => {
    expect(isPuckEditorRoute(`${ADMIN}/pages`)).toBe(false)
    expect(isPuckEditorRoute(`${ADMIN}/layouts`)).toBe(false)
    expect(isPuckEditorRoute(`${ADMIN}/menus/${CUID}`)).toBe(false)
    expect(isPuckEditorRoute(`${ADMIN}/media`)).toBe(false)
    expect(isPuckEditorRoute(`${ADMIN}/config`)).toBe(false)
  })
})
