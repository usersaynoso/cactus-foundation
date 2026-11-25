import { describe, it, expect } from 'vitest'
import { emailHtmlToPlainText, markdownToPlainText } from '@/lib/sanitize'

// The text alternative every email carries. It is what a text-only mail client
// shows, and what a spam filter compares the HTML against, so HTML entities and
// run-together lines in it are a defect a customer reads, not a cosmetic one.
describe('markdownToPlainText', () => {
  it('reads "&", "<" and ">" as themselves, not as their HTML entities', () => {
    expect(markdownToPlainText('Prices & delivery: 5 < 10 > 2')).toBe('Prices & delivery: 5 < 10 > 2')
  })

  it('keeps a line broken with a single return on its own line', () => {
    expect(markdownToPlainText('Thanks,\nChris', { breaks: true })).toBe('Thanks,\nChris')
  })

  it('keeps list items one to a line', () => {
    expect(markdownToPlainText('- one\n- two')).toBe('one\ntwo')
  })
})

describe('emailHtmlToPlainText', () => {
  it('does not decode an entity twice', () => {
    expect(emailHtmlToPlainText('<p>Type &amp;lt;b&amp;gt; for bold</p>')).toBe('Type &lt;b&gt; for bold')
  })
})
