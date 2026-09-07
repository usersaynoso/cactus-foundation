import { describe, it, expect } from 'vitest'
import { sanitizeEmailHtml } from '@/lib/sanitize'

// The tags a writing box actually produces, run through the allow-list that
// stands between somebody's typing and the message that leaves.
//
// Worth its own file because an allow-list is a plain array: nothing typechecks
// it, nothing lints it, and a tag left off it fails silently and late - the
// message goes, and the emphasis is simply not in it. `<strike>` was left off,
// which un-struck every struck-out line the first time a draft was saved.
describe('the emphasis a contentEditable box produces', () => {
  it('keeps bold whichever tag the browser reached for', () => {
    expect(sanitizeEmailHtml('<p><b>Yes</b></p>')).toContain('<b>Yes</b>')
    expect(sanitizeEmailHtml('<p><strong>Yes</strong></p>')).toContain('<strong>Yes</strong>')
  })

  it('keeps italic whichever tag the browser reached for', () => {
    expect(sanitizeEmailHtml('<p><i>Soon</i></p>')).toContain('<i>Soon</i>')
    expect(sanitizeEmailHtml('<p><em>Soon</em></p>')).toContain('<em>Soon</em>')
  })

  it('keeps strikethrough whichever tag the browser reached for', () => {
    expect(sanitizeEmailHtml('<p><strike>Gone</strike></p>')).toContain('<strike>Gone</strike>')
    expect(sanitizeEmailHtml('<p><s>Gone</s></p>')).toContain('<s>Gone</s>')
    expect(sanitizeEmailHtml('<p><del>Gone</del></p>')).toContain('<del>Gone</del>')
  })

  it('still throws out what an allow-list is for', () => {
    const clean = sanitizeEmailHtml('<p>Hi<script>alert(1)</script></p>')
    expect(clean).not.toContain('script')
    expect(clean).toContain('Hi')
  })
})
