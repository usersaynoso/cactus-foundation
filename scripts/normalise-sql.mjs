// Comment-stripping for SQL, so the module migration runner can tell a reworded
// note from a column that never arrived.
//
// Its own file rather than a function inside the runner because the runner
// connects to a database the moment it is imported, and this wants testing
// without one. See scripts/normalise-sql.test.ts - nothing else in the build
// executes a line of SQL, so the parts that read it are worth proving.

// Where a single-quoted literal ends, doubled quotes ('') included - they are an
// escaped quote inside the string, not the end of it.
export function endOfQuoted(sql, start) {
  let i = start + 1
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") { i += 2; continue }
      return i + 1
    }
    i++
  }
  return sql.length
}

/**
 * The file's SQL with its commentary taken out: line comments, block comments
 * and runs of whitespace all collapse away.
 *
 * Two files whose normalised text matches do the identical thing to a database
 * however differently they read, which is what lets the drift check below tell
 * a reworded note from a column that never arrived. Hashing the raw file alone
 * cannot: tidying a comment moves the hash exactly as far as adding an ALTER.
 *
 * String and dollar-quoted literals are copied through untouched - a `--` inside
 * one is data, and stripping from there would change what the file does.
 */
export function normaliseSql(sql) {
  let out = ''
  let i = 0
  while (i < sql.length) {
    const two = sql.slice(i, i + 2)
    if (two === '--') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? sql.length : nl
      out += ' '
      continue
    }
    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2)
      i = end === -1 ? sql.length : end + 2
      out += ' '
      continue
    }
    const ch = sql[i]
    if (ch === "'") {
      const end = endOfQuoted(sql, i)
      out += sql.slice(i, end)
      i = end
      continue
    }
    if (ch === '$') {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (tag) {
        const close = sql.indexOf(tag[0], i + tag[0].length)
        const end = close === -1 ? sql.length : close + tag[0].length
        out += sql.slice(i, end)
        i = end
        continue
      }
    }
    out += ch
    i++
  }
  return out.replace(/\s+/g, ' ').trim()
}
