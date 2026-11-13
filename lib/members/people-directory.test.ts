import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }))

import { csvCell, peopleCsv, type PersonRow } from '@/lib/members/people-directory'

const base: PersonRow = {
  id: 'm1', kind: 'member', username: 'jo', email: 'jo@example.com', displayName: 'Jo Bloggs', fullName: 'Joanne Bloggs', organisation: 'Bloggs Ltd',
  roleId: null, roleName: 'Members', roleProtected: true, status: 'ACTIVE', suspended: false,
  linkedToStaff: false, emailVerified: true, marketingConsent: true, isCustomer: true,
  createdAt: new Date('2026-11-01T10:00:00Z'),
}

describe('csvCell', () => {
  it('defuses anything a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+44 7700')).toBe(`'+44 7700`)
    expect(csvCell('@sum')).toBe(`'@sum`)
  })

  it('quotes commas and quotes, leaves plain text alone', () => {
    expect(csvCell('Smith, Jo')).toBe('"Smith, Jo"')
    expect(csvCell('plain')).toBe('plain')
  })
})

describe('peopleCsv', () => {
  it('adds the customer and marketing columns only when they exist', () => {
    const withCols = peopleCsv([base], true).replace(/^﻿/, '').split('\r\n')
    expect(withCols[0]).toBe('Type,Username,Display name,Full name,Organisation,Email,Status,Email verified,Customer,Marketing emails,Joined')
    expect(withCols[1]).toBe('Member,jo,Jo Bloggs,Joanne Bloggs,Bloggs Ltd,jo@example.com,ACTIVE,Yes,Yes,Yes,2026-11-01')

    const without = peopleCsv([base], false).replace(/^﻿/, '').split('\r\n')
    expect(without[0]).toBe('Type,Username,Display name,Full name,Organisation,Email,Status,Email verified,Joined')
  })

  it('says "Not asked" for a member nobody has asked, and nothing for staff', () => {
    const lines = peopleCsv([{ ...base, marketingConsent: null }, { ...base, kind: 'staff', fullName: null, organisation: null, marketingConsent: null, isCustomer: false }], true).split('\r\n')
    expect(lines[1]).toContain(',Not asked,')
    expect(lines[2]).toBe('Staff,jo,Jo Bloggs,,,jo@example.com,ACTIVE,Yes,,,2026-11-01')
  })
})
