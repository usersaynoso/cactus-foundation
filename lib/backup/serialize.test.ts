import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { serializeValue } from './serialize'

describe('serializeValue', () => {
  it('writes JSON arrays as JSON literals, not SQL arrays', () => {
    // The regression: InfoPage.history / Layout.history are jsonb columns holding
    // an array of past published versions. Rendering them as ARRAY[...] made the
    // restore fail with `column "history" is of type jsonb but expression is of
    // type text[]`.
    expect(serializeValue([{ title: 'Home', at: '2026-01-01' }], 'jsonb')).toBe(
      `'[{"title":"Home","at":"2026-01-01"}]'`,
    )
    expect(serializeValue([], 'jsonb')).toBe(`'[]'`)
    expect(serializeValue(['a', 'b'], 'json')).toBe(`'["a","b"]'`)
  })

  it('handles every JSON value shape a jsonb column can hold', () => {
    expect(serializeValue({ a: 1 }, 'jsonb')).toBe(`'{"a":1}'`)
    expect(serializeValue('plain', 'jsonb')).toBe(`'"plain"'`)
    expect(serializeValue(7, 'jsonb')).toBe('\'7\'')
    expect(serializeValue(true, 'jsonb')).toBe(`'true'`)
    expect(serializeValue(null, 'jsonb')).toBe('NULL')
  })

  it('escapes single quotes inside JSON', () => {
    expect(serializeValue({ title: "Chris's page" }, 'jsonb')).toBe(
      `'{"title":"Chris''s page"}'`,
    )
  })

  it('writes real Postgres array columns as cast ARRAY literals', () => {
    // Passkey.transports is String[] -> udt_name `_text`.
    expect(serializeValue(['usb', 'nfc'], '_text')).toBe(`ARRAY['usb', 'nfc']::text[]`)
    expect(serializeValue([], '_text')).toBe('ARRAY[]::text[]')
    expect(serializeValue([1, 2], '_int4')).toBe('ARRAY[1, 2]::int4[]')
  })

  it('quotes mixed-case element types so enum arrays survive the cast', () => {
    expect(serializeValue(['EMAIL'], '_NotificationChannel')).toBe(
      `ARRAY['EMAIL']::"NotificationChannel"[]`,
    )
  })

  it('renders scalars', () => {
    expect(serializeValue("O'Brien", 'text')).toBe(`'O''Brien'`)
    expect(serializeValue(true, 'bool')).toBe('TRUE')
    expect(serializeValue(false, 'bool')).toBe('FALSE')
    expect(serializeValue(42, 'int4')).toBe('42')
    expect(serializeValue(Number.NaN, 'float8')).toBe('NULL')
    expect(serializeValue(10n, 'int8')).toBe('10')
    expect(serializeValue(new Date('2026-07-14T09:00:00.000Z'), 'timestamptz')).toBe(
      `'2026-07-14T09:00:00.000Z'`,
    )
    expect(serializeValue(new Prisma.Decimal('1.50'), 'numeric')).toBe('1.5')
    expect(serializeValue(Buffer.from([0xde, 0xad]), 'bytea')).toBe(`'\\xdead'`)
    expect(serializeValue(undefined, 'text')).toBe('NULL')
  })
})
