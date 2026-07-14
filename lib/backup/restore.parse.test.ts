import { describe, it, expect } from 'vitest'
import {
  splitSqlStatements,
  insertTargetTable,
  insertColumns,
  setvalTargetSequence,
} from './restore'

// The pure parsers only. The real proof that a backup restores is the round-trip
// test against a live database (roundtrip.test.ts).

describe('splitSqlStatements', () => {
  it('does not split on a semicolon inside a string literal', () => {
    const sql = `INSERT INTO "T" ("a") VALUES ('one; two');\nINSERT INTO "T" ("a") VALUES ('three');`
    expect(splitSqlStatements(sql)).toEqual([
      `INSERT INTO "T" ("a") VALUES ('one; two')`,
      `INSERT INTO "T" ("a") VALUES ('three')`,
    ])
  })

  it('keeps escaped quotes inside the literal', () => {
    const [statement] = splitSqlStatements(`INSERT INTO "T" ("a") VALUES ('it''s fine; really');`)
    expect(statement).toBe(`INSERT INTO "T" ("a") VALUES ('it''s fine; really')`)
  })

  it('strips line comments so they never glue onto the next statement', () => {
    const sql = `-- Table: T (1 rows)\nINSERT INTO "T" ("a") VALUES ('x');`
    expect(splitSqlStatements(sql)).toEqual([`INSERT INTO "T" ("a") VALUES ('x')`])
  })

  it('leaves a -- inside a string alone', () => {
    const [statement] = splitSqlStatements(`INSERT INTO "T" ("a") VALUES ('a -- not a comment');`)
    expect(statement).toBe(`INSERT INTO "T" ("a") VALUES ('a -- not a comment')`)
  })
})

describe('statement parsers', () => {
  it('reads the target table', () => {
    expect(insertTargetTable(`INSERT INTO "InfoPage" ("id") VALUES ('x')`)).toBe('InfoPage')
    expect(insertTargetTable(`SELECT 1`)).toBeNull()
  })

  it('reads the column list, which is what the version-skew check runs on', () => {
    expect(insertColumns(`INSERT INTO "InfoPage" ("id", "title", "history") VALUES ('a','b','[]')`)).toEqual([
      'id',
      'title',
      'history',
    ])
  })

  it('reads the sequence a setval targets', () => {
    expect(setvalTargetSequence(`SELECT setval('"shp_order_number_seq"', 12, TRUE)`)).toBe(
      'shp_order_number_seq',
    )
    expect(setvalTargetSequence(`SELECT setval('plain_seq', 1, FALSE)`)).toBe('plain_seq')
    expect(setvalTargetSequence(`INSERT INTO "T" ("a") VALUES ('x')`)).toBeNull()
  })
})
