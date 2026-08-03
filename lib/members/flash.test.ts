// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setMemberFlash, takeMemberFlash } from './flash'

const KEY = 'cactus:member-flash'

describe('member flash', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('hands a message to the next page', () => {
    setMemberFlash('Your email is verified. You can now sign in.')
    expect(takeMemberFlash()).toEqual({
      message: 'Your email is verified. You can now sign in.',
      tone: 'success',
    })
  })

  it('keeps the tone it was given', () => {
    setMemberFlash('That did not work', 'error')
    expect(takeMemberFlash()?.tone).toBe('error')
  })

  // The point of taking rather than reading: a refresh of the page it landed on
  // must not replay a message about something that happened a screen ago.
  it('reads once and only once', () => {
    setMemberFlash('Read me')
    expect(takeMemberFlash()?.message).toBe('Read me')
    expect(takeMemberFlash()).toBeNull()
  })

  it('is nothing at all when none was left', () => {
    expect(takeMemberFlash()).toBeNull()
  })

  it('ignores a stored value that is not a flash', () => {
    window.sessionStorage.setItem(KEY, 'not json at all')
    expect(takeMemberFlash()).toBeNull()

    window.sessionStorage.setItem(KEY, JSON.stringify({ message: 42 }))
    expect(takeMemberFlash()).toBeNull()

    window.sessionStorage.setItem(KEY, JSON.stringify({ message: '   ' }))
    expect(takeMemberFlash()).toBeNull()
  })

  it('falls back to the neutral tone when the stored one is unknown', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ message: 'Hello', tone: 'catastrophe' }))
    expect(takeMemberFlash()).toEqual({ message: 'Hello', tone: 'success' })
  })

  it('caps the length of what it will show', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ message: 'x'.repeat(500) }))
    expect(takeMemberFlash()?.message).toHaveLength(300)
  })
})
