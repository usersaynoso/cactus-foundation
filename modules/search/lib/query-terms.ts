// Pure query-text handling, kept out of lib/query.ts so it can be tested
// without a database client. Everything here decides what text reaches
// Postgres' tsquery parsers - nothing here touches SQL.

// Splits the trailing word off so it can be prefix-matched ("gre" matches
// "green" while typing) while every earlier term stays required. Bails on the
// websearch syntax the split would corrupt - quoted phrases, `-negation` and
// the `or` operator - because those queries are precise by intent anyway.
export function splitPrefix(q: string): { head: string; prefix: string | null } {
  if (/"/.test(q) || /(^|\s)-\S/.test(q) || /(^|\s)or(\s|$)/i.test(q)) {
    return { head: q, prefix: null }
  }
  const parts = q.trim().split(/\s+/).filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  // to_tsquery throws on syntax errors, so only a purely alphanumeric token is
  // ever passed to it.
  if (!/^[A-Za-z0-9]{2,}$/.test(last)) return { head: q, prefix: null }
  return { head: parts.slice(0, -1).join(' '), prefix: last }
}

// Relaxed retry for a query that matched nothing: ANY term rather than all of
// them, so one stray or misspelt word does not empty the page. Pointless with a
// single term - there is nothing left to drop. Returns the to_tsquery argument,
// stripped to alphanumerics so the parser cannot be fed a syntax error.
export function looseTerms(q: string): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((t) => t.length >= 2)
  if (tokens.length < 2) return null
  return tokens.map((t) => `${t}:*`).join(' | ')
}
