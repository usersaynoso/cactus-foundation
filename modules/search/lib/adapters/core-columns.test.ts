import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// The adapters reach into core's own tables with raw SQL, and raw SQL is a
// string to `tsc`, to `eslint` and to the module build gate alike. A column
// Postgres has never heard of passes every one of them and only shows up as a
// failed reindex on somebody's live site - which is precisely how `u."name"`
// (User has displayName and username, and never had a `name`) took the whole
// Articles source out of the index.
//
// So: every core column an adapter names is checked against schema.prisma here.
// Module tables are somebody else's schema and are left to their own repos.

const CORE_MODELS = ['User', 'Media'] as const

const SCHEMA = readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

// Field names of a Prisma model, in the spelling Postgres uses: the @map name
// where one is given, otherwise the field name verbatim (core takes Prisma's
// default of camelCase columns, quoted in every raw query).
function columnsOf(model: string): Set<string> {
  const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(SCHEMA)
  const body = block?.[1]
  if (!body) throw new Error(`model ${model} not found in schema.prisma`)
  const out = new Set<string>()
  for (const line of body.split('\n')) {
    const field = /^\s*(\w+)\s+\S/.exec(line)?.[1]
    if (!field) continue
    const mapped = /@map\("([^"]+)"\)/.exec(line)?.[1]
    out.add(mapped ?? field)
  }
  return out
}

// Aliases bound to a core table in an adapter's SQL, e.g. `"User" u` or
// `JOIN "Media" m ON ...`, mapped to the model they point at.
function coreAliases(sql: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const model of CORE_MODELS) {
    const re = new RegExp(`"${model}"\\s+(?:AS\\s+)?(\\w+)`, 'g')
    for (const m of sql.matchAll(re)) {
      const alias = m[1]
      if (alias) out.set(alias, model)
    }
  }
  return out
}

const ADAPTER_DIR = path.join(process.cwd(), 'modules/search/lib/adapters')

describe('adapter SQL against core columns', () => {
  const files = readdirSync(ADAPTER_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

  it('has adapters to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file} names only columns core actually has`, () => {
      const sql = readFileSync(path.join(ADAPTER_DIR, file), 'utf8')
      const aliases = coreAliases(sql)
      if (aliases.size === 0) return

      const offenders: string[] = []
      for (const [alias, model] of aliases) {
        const columns = columnsOf(model)
        const re = new RegExp(`\\b${alias}\\."(\\w+)"`, 'g')
        for (const m of sql.matchAll(re)) {
          const column = m[1]
          if (column && !columns.has(column)) offenders.push(`${alias}."${column}" (${model} has no such column)`)
        }
      }
      expect(offenders).toEqual([])
    })
  }
})
