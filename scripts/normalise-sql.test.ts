import { describe, expect, it } from 'vitest'
// @ts-expect-error -- a plain .mjs build script, deliberately outside the TS graph
import { normaliseSql } from '@/scripts/normalise-sql.mjs'

const n = normaliseSql as (sql: string) => string

// The whole point of this function is that two files it agrees on may be applied
// to a database interchangeably. Every case below is a shape that has actually
// turned up in a module migration, and the false-negative cases at the bottom are
// the ones that would have made the drift alarm lie.
describe('normaliseSql', () => {
  it('treats a reworded line comment as no change at all', () => {
    const before = `-- Adds the note.\nALTER TABLE "shp_order_items" ADD COLUMN IF NOT EXISTS "note" TEXT;\n`
    const after = `-- NOTE, LATER: this is no longer quite true, see 044.\n-- Adds the note.\nALTER TABLE "shp_order_items" ADD COLUMN IF NOT EXISTS "note" TEXT;\n`
    expect(n(after)).toBe(n(before))
  })

  it('treats a block comment and reindentation as no change', () => {
    expect(n('/* why */\nCREATE   TABLE  "a" (\n  "b" TEXT\n);')).toBe(n('CREATE TABLE "a" ( "b" TEXT );'))
  })

  it('sees a real column addition', () => {
    const before = 'CREATE TABLE "a" ( "b" TEXT );'
    const after = 'CREATE TABLE "a" ( "b" TEXT, "c" JSONB );'
    expect(n(after)).not.toBe(n(before))
  })

  it('keeps two dashes that are inside a string literal', () => {
    // Stripping from here would turn a default value into a truncated statement,
    // and would call two genuinely different files identical.
    const keeps = `INSERT INTO "a" ("b") VALUES ('-- not a comment');`
    const drops = `INSERT INTO "a" ("b") VALUES ('');`
    expect(n(keeps)).toContain("'-- not a comment'")
    expect(n(keeps)).not.toBe(n(drops))
  })

  it('handles a doubled quote inside a literal', () => {
    const sql = `INSERT INTO "a" ("b") VALUES ('it''s -- fine'); -- trailing\n`
    expect(n(sql)).toBe(`INSERT INTO "a" ("b") VALUES ('it''s -- fine');`)
  })

  it('leaves a dollar-quoted function body alone, comments and all', () => {
    const sql = `CREATE FUNCTION f() RETURNS void AS $body$\n  -- kept\n  SELECT 1;\n$body$ LANGUAGE sql; -- dropped\n`
    expect(n(sql)).toContain('-- kept')
    expect(n(sql)).not.toContain('dropped')
  })

  it('does not run off the end of an unterminated comment or literal', () => {
    expect(() => n('/* never closed')).not.toThrow()
    expect(() => n("SELECT 'never closed")).not.toThrow()
    expect(n('SELECT 1; /* never closed')).toBe('SELECT 1;')
  })

  it('is stable under trailing whitespace and a missing final newline', () => {
    expect(n('SELECT 1;   \n\n')).toBe(n('SELECT 1;'))
  })
})
