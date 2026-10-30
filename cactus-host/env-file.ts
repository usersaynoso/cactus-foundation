// A site's environment, in the format systemd's EnvironmentFile= reads.
//
// One file per site, /srv/cactus/<site>/env, owned by the site's user and readable
// by nobody else. Both halves of a deploy read it through systemd - the build runs
// under `systemd-run -p EnvironmentFile=`, the site under its unit's
// EnvironmentFile= - so this has to write exactly what systemd will parse back, and
// read back exactly what it wrote.
//
// Every value is written double-quoted with `\`, `"`, `$` and backtick escaped. In
// double quotes systemd keeps newlines literally, so a multi-line value (a PEM key)
// survives as itself. systemd does no variable expansion in this file, but the
// escapes keep the file meaning the same thing to anybody who sources it in a shell
// to debug - which is how these files usually get read by a person.
//
// Which keys are secret is NOT recorded here: the file is the site's, and holds
// plaintext because the site has to read it. The secret flag lives in cactus-host's
// own site record, and only decides what the API will hand back.

import { ENV_KEY_PATTERN } from './protocol.ts'

export type EnvMap = Map<string, string>

function quote(value: string): string {
  return `"${value.replace(/[\\"$`]/g, (c) => `\\${c}`)}"`
}

export function serialiseEnv(env: EnvMap, header?: string): string {
  const lines: string[] = []
  if (header) for (const line of header.split('\n')) lines.push(`# ${line}`.trimEnd())
  for (const key of [...env.keys()].sort()) {
    if (!ENV_KEY_PATTERN.test(key)) throw new Error(`"${key}" is not a valid environment variable name`)
    lines.push(`${key}=${quote(env.get(key) ?? '')}`)
  }
  return lines.join('\n') + '\n'
}

/**
 * Parses what serialiseEnv writes, plus the unquoted and single-quoted forms a person
 * editing the file by hand might use. Throws on anything it cannot read for certain:
 * a half-understood env file is how a site boots with the wrong database.
 */
export function parseEnv(text: string): EnvMap {
  const env: EnvMap = new Map()
  let i = 0
  const n = text.length
  let line = 1

  const fail = (why: string): never => {
    throw new Error(`env file, line ${line}: ${why}`)
  }

  while (i < n) {
    // Blank lines and comments.
    const ch = text[i]
    if (ch === '\n') {
      line++
      i++
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++
      continue
    }
    if (ch === '#' || ch === ';') {
      while (i < n && text[i] !== '\n') i++
      continue
    }

    const eq = text.indexOf('=', i)
    const eol = text.indexOf('\n', i)
    if (eq === -1 || (eol !== -1 && eol < eq)) fail('expected KEY=value')
    const key = text.slice(i, eq).trim()
    if (!ENV_KEY_PATTERN.test(key)) fail(`"${key}" is not a valid environment variable name`)
    i = eq + 1

    let value = ''
    const open = text[i]
    if (open === '"') {
      i++
      let closed = false
      while (i < n) {
        const c = text[i] as string
        if (c === '\\' && i + 1 < n) {
          const next = text[i + 1] as string
          if (next === '\n') {
            line++
          } else {
            value += next
          }
          i += 2
          continue
        }
        if (c === '"') {
          closed = true
          i++
          break
        }
        if (c === '\n') line++
        value += c
        i++
      }
      if (!closed) fail(`the value of ${key} has no closing quote`)
    } else if (open === "'") {
      const close = text.indexOf("'", i + 1)
      if (close === -1) fail(`the value of ${key} has no closing quote`)
      value = text.slice(i + 1, close)
      for (const c of value) if (c === '\n') line++
      i = close + 1
    } else {
      const end = eol === -1 ? n : eol
      value = text.slice(i, end).trim()
      i = end
    }

    // Only whitespace may follow a quoted value on its line.
    while (i < n && text[i] !== '\n') {
      const c = text[i]
      if (c !== ' ' && c !== '\t' && c !== '\r') fail(`unexpected text after the value of ${key}`)
      i++
    }
    env.set(key, value)
  }
  return env
}
