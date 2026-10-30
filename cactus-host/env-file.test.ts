import { describe, expect, it } from 'vitest'
import { parseEnv, serialiseEnv } from './env-file.ts'

describe('env file', () => {
  it('round-trips awkward values exactly', () => {
    const env = new Map([
      ['DATABASE_URL', 'postgresql://u:p@localhost/db?sslmode=disable&connection_limit=10'],
      ['QUOTED', 'say "hello" to $HOME and `pwd` \\ done'],
      ['PEM', '-----BEGIN KEY-----\nabc\ndef\n-----END KEY-----'],
      ['EMPTY', ''],
      ['SPACES', '  padded  '],
    ])
    expect(parseEnv(serialiseEnv(env))).toEqual(env)
  })

  it('writes keys sorted, with a commented header', () => {
    const text = serialiseEnv(new Map([['B', '2'], ['A', '1']]), 'Managed by cactus-host.\nDo not edit.')
    expect(text).toBe('# Managed by cactus-host.\n# Do not edit.\nA="1"\nB="2"\n')
  })

  it('reads the hand-edited forms systemd accepts', () => {
    const env = parseEnv("# comment\n\nPLAIN=value here  \nSQ='a $b'\n; also a comment\n")
    expect(env.get('PLAIN')).toBe('value here')
    expect(env.get('SQ')).toBe('a $b')
  })

  it('refuses what it cannot read for certain', () => {
    expect(() => parseEnv('NOT A LINE\n')).toThrow(/line 1/)
    expect(() => parseEnv('A="open\n')).toThrow(/closing quote/)
    expect(() => parseEnv('1BAD=x\n')).toThrow(/valid environment variable name/)
    expect(() => parseEnv('A="x" trailing\n')).toThrow(/unexpected text/)
  })

  it('refuses to write a key systemd would reject', () => {
    expect(() => serialiseEnv(new Map([['BAD-KEY', 'x']]))).toThrow()
  })
})
