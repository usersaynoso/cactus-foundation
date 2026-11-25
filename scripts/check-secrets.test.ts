// The guard that would have stopped 2026-06-29: a Vercel token committed inside
// .claude/settings.json, reachable from 33 release tags until a history rewrite
// on 2026-11-25. See the script's header for the whole story.
//
// Two halves. The fixture half proves the detector detects - a scanner that says
// "clean" whatever you feed it is worse than none. The live half is the
// regression guard: every tracked file in this repo, on every `npm test`.
//
// Every fake credential below is assembled at runtime (`j(...)`), so this file
// never contains a token-shaped literal and stays clean under its own scan.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  ALLOW_MARKER,
  forbiddenPathReason,
  looksRandom,
  parseDiff,
  scanLines,
  scanStaged,
  scanTracked,
} from './check-secrets.mjs'

const j = (...parts: string[]) => parts.join('')
const rep = (ch: string, n: number) => ch.repeat(n)
const mixed = (n: number) => 'aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0z'.repeat(4).slice(0, n)

function rulesHit(text: string): string[] {
  return scanLines('fixture.ts', [{ line: 1, text }]).map((f) => f.rule)
}

describe('check-secrets detectors', () => {
  const cases: [string, string, string][] = [
    ['vercel-token', 'The 2026-06-29 leak shape', j('VERCEL_TOKEN=', 'vcp', '_', mixed(56), ' vercel deploy')],
    ['github-token', 'classic PAT', j('token: "', 'ghp', '_', mixed(36), '"')],
    ['github-pat', 'fine-grained PAT', j('github', '_pat_', mixed(30), '_', mixed(50))],
    ['anthropic-key', 'Anthropic key', j('sk-', 'ant-', 'api03-', mixed(60))],
    ['openai-key', 'OpenAI project key', j('sk-', 'proj-', mixed(60))],
    ['stripe-key', 'Stripe live key', j('sk', '_live_', mixed(24))],
    ['stripe-webhook', 'Stripe webhook secret', j('wh', 'sec_', mixed(32))],
    ['aws-key', 'AWS key id', j('AK', 'IA', 'Z7Q2M4N6P8R1S3T5')],
    ['google-api-key', 'Google key', j('AI', 'za', mixed(35))],
    ['slack-token', 'Slack bot token', j('xo', 'xb-', '1234567890-', mixed(24))],
    ['brevo-key', 'Brevo key', j('xkey', 'sib-', rep('a1', 32), '-', mixed(16))],
    ['sendgrid-key', 'SendGrid key', j('SG', '.', mixed(22), '.', mixed(43))],
    ['twilio-key', 'Twilio key', j('S', 'K', rep('0a', 16))],
    ['npm-token', 'npm token', j('np', 'm_', mixed(36))],
    ['neon-password', 'Neon password', j('np', 'g_', mixed(14))],
    ['telegram-bot-token', 'Telegram bot', j('123456789', ':', 'AA', mixed(33))],
    ['url-credentials', 'password in a database URL', j('postgresql://deskwell:', 'Tr0ub4dor&3xyz', '@db.example.net:5432/app')],
    ['bearer-token', 'curl with a literal token', j("-H 'Authorization: Bearer ", mixed(40), "'")],
    ['jwt', 'signed JWT', j('ey', 'J', mixed(20), '.ey', 'J', mixed(30), '.', mixed(43))],
    ['assigned-secret', 'random value named as a secret', j("apiKey: '", mixed(32), "'")],
  ]

  it.each(cases)('%s: %s', (rule, _why, text) => {
    expect(rulesHit(text)).toContain(rule)
  })

  it('finds a private key block with a real body, inline or across lines', () => {
    const body = rep('MIIEowIBAAKCAQEA', 6)
    const header = j('-----BEGIN RSA ', 'PRIVATE KEY-----')
    expect(scanLines('k.ts', [{ line: 7, text: j("const k = '", header, '\\n', body, "'") }]).map((f) => f.rule)).toEqual(['private-key'])
    const lines = [header, body, '-----END RSA PRIVATE KEY-----'].map((text, i) => ({ line: i + 1, text }))
    expect(scanLines('k.pem', lines)).toEqual([expect.objectContaining({ rule: 'private-key', line: 1 })])
  })

  it('leaves alone the fakes this repo already uses', () => {
    const header = j('-----BEGIN RSA ', 'PRIVATE KEY-----')
    expect(rulesHit(j("encryptSecret('", header, "not a real key-----END RSA PRIVATE KEY-----')"))).toEqual([])
    expect(rulesHit(j("const secret = '", header, "\\nabc\\n-----END RSA PRIVATE KEY-----'"))).toEqual([])
    expect(rulesHit('url: `postgresql://${role}:${encoded}@127.0.0.1:5432/db`')).toEqual([])
    expect(rulesHit('postgresql://postgres:cactus@localhost:5432/cactus')).toEqual([])
    expect(rulesHit('shop/desk-with-cable-ports-with-steel-modesty-panel')).toEqual([])
    expect(rulesHit("password: 'correct-horse-battery-staple'")).toEqual([])
    expect(rulesHit('token: process.env.GITHUB_TOKEN')).toEqual([])
    expect(rulesHit("const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'")).toEqual([])
    expect(rulesHit("const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'")).toEqual([])
    expect(rulesHit(j('VERCEL_TOKEN=', 'vcp', '_', rep('x', 4), 'REDACTED', rep('x', 20)))).toEqual([])
  })

  it('honours the allow marker on the line or the line before', () => {
    const key = j('gh', 'p_', mixed(36))
    expect(scanLines('a.ts', [{ line: 1, text: `const k = '${key}' // ${ALLOW_MARKER}` }])).toEqual([])
    expect(
      scanLines('a.ts', [
        { line: 1, text: `// ${ALLOW_MARKER}: published test vector` },
        { line: 2, text: `const k = '${key}'` },
      ]),
    ).toEqual([])
  })

  it('never echoes the value it found', () => {
    const key = j('vc', 'p_', mixed(56))
    const findings = scanLines('a.sh', [{ line: 1, text: key }])
    expect(findings).toHaveLength(1)
    expect(findings[0]?.preview).not.toContain(key.slice(4))
  })

  it('refuses files that should never be tracked', () => {
    expect(forbiddenPathReason('.claude/settings.json')).toMatch(/Claude Code/)
    expect(forbiddenPathReason('modules/shop/.claude/settings.local.json')).toMatch(/Claude Code/)
    expect(forbiddenPathReason('.env')).toMatch(/environment/)
    expect(forbiddenPathReason('.env.local')).toMatch(/environment/)
    expect(forbiddenPathReason('.env.example')).toBeNull()
    expect(forbiddenPathReason('deploy/id_ed25519')).toMatch(/SSH/)
    expect(forbiddenPathReason('deploy/id_ed25519.pub')).toBeNull()
    expect(forbiddenPathReason('.claude/skills/foo/SKILL.md')).toBeNull()
  })

  it('judges randomness, not just length', () => {
    expect(looksRandom(mixed(32))).toBe(true)
    expect(looksRandom('aaaaaaaaaaaaaaaaaaaaaaaa1')).toBe(false)
    expect(looksRandom('your-api-key-goes-here-12345')).toBe(false)
  })

  it('maps diff lines to where they land in the file', () => {
    const diff = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -10,0 +11,2 @@', '+one', '+two'].join('\n')
    expect(parseDiff(diff)).toEqual([{ commit: undefined, file: 'x.ts', lines: [{ line: 11, text: 'one' }, { line: 12, text: 'two' }] }])
  })
})

describe('check-secrets against a real repository', () => {
  let repo: string
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'check-secrets-'))
    git(['init', '--quiet', '--initial-branch=main'])
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'Test'])
    mkdirSync(path.join(repo, '.claude'))
    writeFileSync(path.join(repo, 'clean.ts'), 'export const x = 1\n')
    writeFileSync(path.join(repo, 'leak.sh'), j('echo ok\n', 'VERCEL_TOKEN=', 'vcp', '_', mixed(56), ' vercel deploy\n'))
    writeFileSync(path.join(repo, '.claude', 'settings.json'), '{ "permissions": { "allow": [] } }\n')
  })
  afterAll(() => rmSync(repo, { recursive: true, force: true }))

  it('catches a staged token and a staged settings file, with line numbers', () => {
    git(['add', '-f', '.'])
    const findings = scanStaged({ root: repo })
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'leak.sh', line: 2, rule: 'vercel-token' }),
        expect.objectContaining({ file: '.claude/settings.json', rule: 'forbidden-file' }),
      ]),
    )
    expect(findings.some((f) => f.file === 'clean.ts')).toBe(false)
  })

  it('limits a staged scan to the named paths', () => {
    expect(scanStaged({ root: repo, paths: ['clean.ts'] })).toEqual([])
  })
})

describe('check-secrets over this repository', () => {
  it('finds no credential in any tracked file', () => {
    const findings = scanTracked({ root: path.resolve(__dirname, '..') })
    expect(findings.map((f) => `${f.file}:${f.line} ${f.label} ${f.preview}`)).toEqual([])
  })
})
