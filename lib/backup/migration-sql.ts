// Splitting MIGRATION SQL into statements.
//
// This is deliberately NOT the backup format's own splitter. That one lives in
// restore.ts, parses the files this system writes, and is the last thing anybody
// should be casual with: it decides what gets executed against a database during
// a restore, and the format it reads never uses dollar-quoting.
//
// Migrations are a different input with a different author. Ours carry `$$`-quoted
// DO blocks - shop alone has six - and a semicolon inside one of those bodies is
// not the end of a statement. Feeding them to the restore splitter chops the block
// in half, so the tests that read migrations to build a schema had to skip every
// module that used one. That is how the backup round-trip came to silently exclude
// shop, shop-variations and others: the gate that proves a backup restores was
// never shown the tables most of a site's rows live in.
//
// Hence a second, separate splitter, used only for reading migrations off disk in
// tests. Two parsers rather than one shared parser doing both jobs is the point:
// widening the restore splitter to cope with migration syntax would be a change to
// the code path a real restore runs through, for the benefit of a test.
//
// Handles, in the order it meets them: `--` line comments, `/* */` block comments,
// single-quoted strings, and `$tag$ ... $tag$` bodies of any tag. Everything else
// is statement text, and a bare `;` outside all of those ends a statement.
//
// Not a SQL parser and not trying to be. It is enough for the migrations in this
// repository, and it is exercised against every one of them by the module schema
// builds in lib/backup/roundtrip.test.ts and lib/backup/shop-sql.test.ts - if it
// ever mis-splits one, those fail loudly against a real Postgres rather than
// quietly producing a half-built schema.

export function splitMigrationStatements(sql: string): string[] {
  const out: string[] = []
  let start = 0
  let i = 0
  while (i < sql.length) {
    const two = sql.slice(i, i + 2)
    if (two === '--') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl + 1
      continue
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      continue
    }
    if (sql[i] === "'") {
      i++
      while (i < sql.length && sql[i] !== "'") i++
      i++
      continue
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
    if (tag) {
      const close = sql.indexOf(tag[0], i + tag[0].length)
      i = close === -1 ? sql.length : close + tag[0].length
      continue
    }
    if (sql[i] === ';') {
      const stmt = sql.slice(start, i).trim()
      if (stmt) out.push(stmt)
      start = i + 1
    }
    i++
  }
  const tail = sql.slice(start).trim()
  if (tail) out.push(tail)
  return out
}
