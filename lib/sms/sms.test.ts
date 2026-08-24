import { describe, it, expect } from 'vitest'
import { smsSegments } from '@/lib/sms/render'
import { normaliseSmsNumber } from '@/lib/sms/send'
import { smsOverrideValue } from '@/lib/sms/registry'

// The two pure halves of the text-message path. Rendering and sending both talk
// to the database or to a provider and are covered by the routes that use them;
// these two decide what an owner is charged and whether a message is deliverable
// at all, so they are worth pinning down on their own.

describe('smsSegments', () => {
  it('counts a short plain message as one segment', () => {
    const result = smsSegments('Deskwell: order DW000123 is on its way.')
    expect(result.unicode).toBe(false)
    expect(result.segments).toBe(1)
    expect(result.chars).toBe(39)
  })

  it('treats 160 plain characters as one segment and 161 as two', () => {
    expect(smsSegments('a'.repeat(160)).segments).toBe(1)
    expect(smsSegments('a'.repeat(161)).segments).toBe(2)
  })

  it('drops to 70 characters a segment as soon as anything is outside the plain set', () => {
    // A curly apostrophe out of a word processor is the usual culprit, and it
    // doubles the bill for a message an owner thought was fine.
    const curly = `it${String.fromCharCode(0x2019)}s ${'a'.repeat(70)}`
    expect(smsSegments(curly).unicode).toBe(true)
    expect(smsSegments(curly).segments).toBe(2)
  })

  it('counts the GSM extension characters as plain', () => {
    expect(smsSegments('Total £10 [see terms] {ok} ~ | € \\ ^').unicode).toBe(false)
  })

  it('counts nothing for an empty message', () => {
    expect(smsSegments('')).toEqual({ chars: 0, segments: 0, unicode: false })
  })
})

describe('normaliseSmsNumber', () => {
  it('turns a UK national number into E.164', () => {
    expect(normaliseSmsNumber('07700 900123')).toBe('+447700900123')
    expect(normaliseSmsNumber('07700-900123')).toBe('+447700900123')
  })

  it('leaves an international number alone', () => {
    expect(normaliseSmsNumber('+353 86 1234567')).toBe('+353861234567')
  })

  it('reads 00 as the other way of writing +', () => {
    expect(normaliseSmsNumber('00447700900123')).toBe('+447700900123')
  })

  it('honours a different default dialling code', () => {
    expect(normaliseSmsNumber('0412345678', '61')).toBe('+61412345678')
  })

  it('answers null for anything it cannot make sense of', () => {
    expect(normaliseSmsNumber('')).toBeNull()
    expect(normaliseSmsNumber(null)).toBeNull()
    expect(normaliseSmsNumber('not a number')).toBeNull()
    expect(normaliseSmsNumber('+0123')).toBeNull()
  })
})

// The text twin of the email editor's rule: a stored copy that says exactly
// what the default says is not an edit, and must not win over the default.
describe('smsOverrideValue', () => {
  it('treats a copy of the default as no override', () => {
    expect(smsOverrideValue('Order {{orderNumber}} shipped', 'Order {{orderNumber}} shipped')).toBeNull()
  })

  it('keeps a genuine edit', () => {
    expect(smsOverrideValue('Order {{orderNumber}} is out', 'Order {{orderNumber}} shipped')).toBe('Order {{orderNumber}} is out')
  })

  it('passes null and undefined straight through', () => {
    expect(smsOverrideValue(null, 'x')).toBeNull()
    expect(smsOverrideValue(undefined, 'x')).toBeNull()
  })
})
