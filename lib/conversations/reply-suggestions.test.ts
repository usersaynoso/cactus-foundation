import { describe, expect, it } from 'vitest'
import { trimTranscript } from '@/lib/conversations/reply-suggestions'

describe('trimTranscript', () => {
  const message = (text: string) => ({ text })

  it('leaves a short conversation exactly as it found it', () => {
    const messages = [message('one'), message('two'), message('three')]
    expect(trimTranscript(messages, 100)).toEqual(messages)
  })

  it('keeps the newest end and drops the beginning, still oldest first', () => {
    const messages = [message('aaaa'), message('bbbb'), message('cccc')]
    expect(trimTranscript(messages, 8)).toEqual([message('bbbb'), message('cccc')])
  })

  it('keeps one message however long it is, rather than answering with nothing', () => {
    const messages = [message('x'.repeat(50))]
    expect(trimTranscript(messages, 10)).toEqual(messages)
  })

  it('has nothing to say about an empty conversation', () => {
    expect(trimTranscript([], 10)).toEqual([])
  })
})
