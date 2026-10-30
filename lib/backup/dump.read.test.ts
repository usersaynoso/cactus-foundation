import { describe, it, expect } from 'vitest'
import { selectExpression, READ_AS_TEXT } from './dump'
import { serializeValue, type ColumnType } from './serialize'

const col = (udtName: string): ColumnType => ({
  table: 'srch_documents',
  column: 'search_vector',
  udtName,
  isEnum: false,
})

describe('backup read path for types Prisma cannot deserialise', () => {
  it('selects a tsvector column as text (regression: "Backup failed", P2010)', () => {
    expect(selectExpression(col('tsvector'))).toBe('"search_vector"::text AS "search_vector"')
  })

  it('selects every Prisma-unreadable type as text', () => {
    for (const t of ['tsvector', 'tsquery', 'vector', 'inet', 'cidr', 'macaddr', 'macaddr8', 'interval', 'money', 'xml']) {
      expect(READ_AS_TEXT.has(t), t).toBe(true)
    }
  })

  it('leaves ordinary columns alone', () => {
    expect(selectExpression(col('text'))).toBe('"search_vector"')
  })

  it('writes a tsvector text form back as a quoted literal Postgres re-casts on INSERT', () => {
    const text = `'it''s':3 'office':1,4 'desk':2A`
    expect(serializeValue(text, col('tsvector'))).toBe(`'${text.replace(/'/g, "''")}'`)
  })

  it('writes a pgvector value back as its bracket text form', () => {
    expect(serializeValue('[1,2,3]', col('vector'))).toBe(`'[1,2,3]'`)
  })
})
