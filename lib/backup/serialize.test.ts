import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { serializeValue, UnsupportedColumnError, type ColumnType } from './serialize'

const col = (udtName: string, isEnum = false): ColumnType => ({
  table: 'InfoPage',
  column: 'history',
  udtName,
  isEnum,
})

describe('serializeValue', () => {
  it('writes JSON arrays as JSON literals, not SQL arrays', () => {
    // The regression: InfoPage.history / Layout.history are jsonb columns holding
    // an array of past published versions. Rendering them as ARRAY[...] made the
    // restore fail with `column "history" is of type jsonb but expression is of
    // type text[]`.
    expect(serializeValue([{ title: 'Home', at: '2026-01-01' }], col('jsonb'))).toBe(
      `'[{"title":"Home","at":"2026-01-01"}]'`,
    )
    expect(serializeValue([], col('jsonb'))).toBe(`'[]'`)
    expect(serializeValue(['a', 'b'], col('json'))).toBe(`'["a","b"]'`)
  })

  it('handles every JSON value shape a jsonb column can hold', () => {
    expect(serializeValue({ a: 1 }, col('jsonb'))).toBe(`'{"a":1}'`)
    expect(serializeValue('plain', col('jsonb'))).toBe(`'"plain"'`)
    expect(serializeValue(7, col('jsonb'))).toBe(`'7'`)
    expect(serializeValue(true, col('jsonb'))).toBe(`'true'`)
    expect(serializeValue(null, col('jsonb'))).toBe('NULL')
  })

  it('escapes single quotes inside JSON', () => {
    expect(serializeValue({ title: "Chris's page" }, col('jsonb'))).toBe(
      `'{"title":"Chris''s page"}'`,
    )
  })

  it('writes real Postgres array columns as cast ARRAY literals', () => {
    // Passkey.transports is String[] -> udt_name `_text`.
    expect(serializeValue(['usb', 'nfc'], col('_text'))).toBe(`ARRAY['usb', 'nfc']::text[]`)
    expect(serializeValue([], col('_text'))).toBe('ARRAY[]::text[]')
    expect(serializeValue([1, 2], col('_int4'))).toBe('ARRAY[1, 2]::int4[]')
    expect(serializeValue([null, 'a'], col('_text'))).toBe(`ARRAY[NULL, 'a']::text[]`)
  })

  it('quotes mixed-case element types so enum arrays survive the cast', () => {
    expect(serializeValue(['EMAIL'], col('_NotificationChannel', true))).toBe(
      `ARRAY['EMAIL']::"NotificationChannel"[]`,
    )
  })

  it('renders scalars', () => {
    expect(serializeValue("O'Brien", col('text'))).toBe(`'O''Brien'`)
    expect(serializeValue('PUBLISHED', col('PageStatus', true))).toBe(`'PUBLISHED'`)
    expect(serializeValue(true, col('bool'))).toBe('TRUE')
    expect(serializeValue(false, col('bool'))).toBe('FALSE')
    expect(serializeValue(42, col('int4'))).toBe('42')
    expect(serializeValue(10n, col('int8'))).toBe('10')
    expect(serializeValue(new Date('2026-07-14T09:00:00.000Z'), col('timestamp'))).toBe(
      `'2026-07-14T09:00:00.000Z'`,
    )
    expect(serializeValue(new Prisma.Decimal('7.99'), col('numeric'))).toBe(`'7.99'`)
    expect(serializeValue(Buffer.from([0xde, 0xad]), col('bytea'))).toBe(`'\\xdead'`)
    // Prisma's raw queries return bytea as a bare Uint8Array, not a Buffer.
    expect(serializeValue(new Uint8Array([0xde, 0xad]), col('bytea'))).toBe(`'\\xdead'`)
    expect(serializeValue(undefined, col('text'))).toBe('NULL')
  })

  it('keeps non-finite floats instead of silently nulling them', () => {
    // The old code turned NaN/Infinity into NULL - a silent data change, and an
    // outright restore failure on a NOT NULL column.
    expect(serializeValue(Number.NaN, col('float8'))).toBe(`'NaN'`)
    expect(serializeValue(Number.POSITIVE_INFINITY, col('float8'))).toBe(`'Infinity'`)
  })

  describe('never guesses', () => {
    it('throws on a column type it has never round-trip tested', () => {
      expect(() => serializeValue('192.168.0.1', col('some_new_type'))).toThrow(
        UnsupportedColumnError,
      )
      // ...and names the column, so whoever gets the report can act on it.
      expect(() => serializeValue('x', col('some_new_type'))).toThrow(/"history" column on "InfoPage"/)
    })

    it('throws when the value is not the shape its column type implies', () => {
      expect(() => serializeValue({ a: 1 }, col('text'))).toThrow(UnsupportedColumnError)
      expect(() => serializeValue('yes', col('bool'))).toThrow(UnsupportedColumnError)
      expect(() => serializeValue({ a: 1 }, col('_text'))).toThrow(UnsupportedColumnError)
      expect(() => serializeValue('abc', col('int4'))).toThrow(UnsupportedColumnError)
      expect(() => serializeValue(Buffer.from('x'), col('jsonb'))).toThrow(UnsupportedColumnError)
    })
  })
})
