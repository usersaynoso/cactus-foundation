#!/usr/bin/env node
/**
 * Finds credentials before they reach a commit.
 *
 * On 2026-06-29 a Vercel token went into this public repository inside
 * `.claude/settings.json`. Nobody typed it into a source file. An agent ran
 * `VERCEL_TOKEN=vcp_... vercel deploy`, Claude Code saved that exact command
 * line, token and all, as an "always allow" permission rule, and the settings
 * file was committed along with everything else. It stayed reachable through 33
 * release tags until GitGuardian flagged it on 2026-11-25, and getting it out
 * took a history rewrite and a force-push. Every check this repo ran said
 * nothing, because none of them looked for it.
 *
 * Three gates run this script, so one forgotten step is not enough to let a key
 * through:
 *   1. The pre-commit hook (`scripts/git-hooks/pre-commit`, switched on with
 *      `npm run hooks:install`) scans what is about to be committed.
 *   2. `scripts/check-secrets.test.ts` scans every tracked file on plain
 *      `npm test`, so a key already in the tree fails the suite.
 *   3. The commit-and-push skill scans the staged paths before it commits.
 *
 * What it looks for: provider tokens with a recognisable shape (Vercel, GitHub,
 * OpenAI, Anthropic, Stripe, AWS, Brevo, Twilio, Slack, Telegram, Neon, npm,
 * SendGrid, Google, Backblaze), private key blocks with a real body,
 * passwords inside connection URLs, literal bearer tokens, signed JWTs, and
 * long high-entropy strings assigned to something called a key, secret, token
 * or password. It also refuses files that should never be tracked at all:
 * `.env` files, Claude Code's settings files and SSH private keys.
 *
 * A line that genuinely needs a token-shaped value (a published test vector,
 * a fake key in a fixture) carries the marker `secret-scan: allow` on that line
 * or the one before it. The marker is a decision made in review, so a hit
 * should be fixed, not waved through: anything real goes in an environment
 * variable or the database's encrypted settings, never in a tracked file.
 *
 * Findings never print the value itself, only a short redacted preview, so the
 * scanner's own output cannot leak what it found into a log or a transcript.
 *
 * Usage:
 *   node scripts/check-secrets.mjs                     # every tracked file
 *   node scripts/check-secrets.mjs --staged [-- paths] # what is about to be committed
 *   node scripts/check-secrets.mjs --history [range]   # every line ever added (default: all refs)
 *   add --json for machine output, --root DIR to scan another repository
 *
 * Exit codes: 0 clean, 1 findings, 2 the scan itself failed.
 */

import { execFileSync } from 'child_process'
import { readFileSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export const ALLOW_MARKER = 'secret-scan: allow'

/** Words that mark a value as a placeholder rather than a credential. */
const PLACEHOLDER = /example|placeholder|your[_-]?|xxxx|redacted|removed|dummy|fake|sample|changeme|change[_-]me|not[_-]?a[_-]?real|<[^>]*>|\*\*\*/i

/**
 * Line rules. `re` must not be global; `group` names the capture holding the
 * secret when only part of the match is sensitive.
 * @type {{ id: string, label: string, re: RegExp, group?: number, reject?: (value: string) => boolean }[]}
 */
export const LINE_RULES = [
  { id: 'vercel-token', label: 'Vercel token', re: /\b(?:vcp|vci|vca|vcr|vck)_[A-Za-z0-9]{24,}/ },
  { id: 'github-token', label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: 'github-pat', label: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{50,}/ },
  { id: 'anthropic-key', label: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}/ },
  { id: 'openai-key', label: 'OpenAI API key', re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/ },
  { id: 'stripe-key', label: 'Stripe secret key', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { id: 'stripe-webhook', label: 'Stripe webhook secret', re: /\bwhsec_[A-Za-z0-9+/=]{24,}/ },
  { id: 'aws-key', label: 'AWS access key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id: 'google-api-key', label: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/ },
  { id: 'slack-token', label: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { id: 'slack-webhook', label: 'Slack webhook', re: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/ },
  { id: 'brevo-key', label: 'Brevo key', re: /\bx(?:keysib|smtpsib)-[a-f0-9]{64}-[A-Za-z0-9]{16}/ },
  { id: 'sendgrid-key', label: 'SendGrid key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/ },
  { id: 'twilio-key', label: 'Twilio API key', re: /\bSK[0-9a-f]{32}\b/ },
  { id: 'npm-token', label: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'neon-password', label: 'Neon password', re: /\bnpg_[A-Za-z0-9]{12,}/ },
  { id: 'b2-key', label: 'Backblaze application key', re: /(?<![A-Za-z0-9+/])K00[0-9A-Za-z+/]{25,40}(?![A-Za-z0-9+/=])/ },
  { id: 'telegram-bot-token', label: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}(?![A-Za-z0-9_-])/ },
  {
    id: 'url-credentials',
    label: 'Password inside a URL',
    re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:/@'"`<>{}$]+:([^\s@'"`<>{}$]{8,})@[A-Za-z0-9.-]+/,
    group: 1,
  },
  {
    id: 'bearer-token',
    label: 'Literal bearer token',
    re: /Authorization['"]?\s*[:=]?\s*['"]?Bearer\s+([A-Za-z0-9._~+/-]{24,}=*)/i,
    group: 1,
  },
  {
    id: 'jwt',
    label: 'Signed JWT',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/,
  },
  {
    id: 'assigned-secret',
    label: 'High-entropy value assigned to a secret name',
    re: /(?:api[_-]?key|apikey|secret|token|passw(?:or)?d|access[_-]?key|private[_-]?key|client[_-]?secret)\w*['"]?\s*[:=]\s*['"`]([^'"`\s]{20,})['"`]/i,
    group: 1,
    reject: (value) => !looksRandom(value),
  },
]

/** Private key header followed by a real base64 body, inline (`\n` escapes) or across lines. */
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----(?:\\n|\s)+[A-Za-z0-9+/=]{64}/

/** Files that must never be tracked, whatever they hold. */
export function forbiddenPathReason(file) {
  const base = path.posix.basename(file)
  if (/^\.env(\..+)?$/.test(base) && !/^\.env\.(example|sample|template)$/.test(base)) {
    return 'environment file - credentials belong in the deployment environment, not git'
  }
  if (/(^|\/)\.claude\/settings(\.local)?\.json$/.test(file)) {
    return "Claude Code settings - permission rules save whole command lines, tokens included"
  }
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(base)) return 'SSH private key'
  return null
}

/** Shannon entropy in bits per character, plus a mix of character classes. */
export function looksRandom(value) {
  if (PLACEHOLDER.test(value) || /\$\{|\{\{|%s|process\.env/.test(value)) return false
  // An endpoint such as TOKEN_URL = 'https://oauth2.googleapis.com/token' is not
  // a secret; a password inside a URL is caught by the url-credentials rule.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^\.{0,2}\//.test(value)) return false
  if (/^[a-z_.-]+$/i.test(value) || /^[0-9]+$/.test(value)) return false
  if (!/[0-9]/.test(value) || !/[A-Za-z]/.test(value)) return false
  const counts = new Map()
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let bits = 0
  for (const n of counts.values()) {
    const p = n / value.length
    bits -= p * Math.log2(p)
  }
  return bits >= 4
}

function redact(value) {
  return value.length <= 8 ? '***' : `${value.slice(0, 4)}…(${value.length} chars)`
}

function allowed(lines, index) {
  return lines[index].text.includes(ALLOW_MARKER) || (index > 0 && lines[index - 1].text.includes(ALLOW_MARKER))
}

/**
 * Scan one file's lines. `lines` carries real line numbers so a diff's added
 * lines report where they will land, not where they sit in the hunk.
 * @param {string} file
 * @param {{ line: number, text: string }[]} lines
 */
export function scanLines(file, lines) {
  const findings = []
  for (let i = 0; i < lines.length; i++) {
    const { line, text } = lines[i]
    if (text.length > 20000 || allowed(lines, i)) continue
    for (const rule of LINE_RULES) {
      const m = rule.re.exec(text)
      if (!m) continue
      const value = rule.group ? m[rule.group] : m[0]
      if (rule.id !== 'assigned-secret' && PLACEHOLDER.test(value)) continue
      if (rule.reject?.(value)) continue
      findings.push({ file, line, rule: rule.id, label: rule.label, preview: redact(value) })
    }
  }
  const joined = lines.map((l) => l.text).join('\n')
  const block = PRIVATE_KEY_BLOCK.exec(joined)
  if (block) {
    const index = joined.slice(0, block.index).split('\n').length - 1
    if (!allowed(lines, index)) {
      findings.push({ file, line: lines[index].line, rule: 'private-key', label: 'Private key', preview: '-----BEGIN …' })
    }
  }
  return findings
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function repoRoot(dir) {
  return git(dir, ['rev-parse', '--show-toplevel']).trim()
}

/**
 * Parse `git diff`/`git log -p` output run with -U0 into added lines per file.
 * @returns {{ commit?: string, file: string, lines: { line: number, text: string }[] }[]}
 */
export function parseDiff(output) {
  const files = []
  let commit
  let current = null
  let next = 0
  for (const raw of output.split('\n')) {
    if (raw.startsWith('\u0000commit ')) {
      commit = raw.slice(8).trim()
      current = null
    } else if (raw.startsWith('diff --git ')) {
      current = null
    } else if (raw.startsWith('+++ ')) {
      const target = raw.slice(4)
      current = target === '/dev/null' ? null : { commit, file: target.replace(/^b\//, ''), lines: [] }
      if (current) files.push(current)
    } else if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw)
      next = m ? Number(m[1]) : 0
    } else if (current && raw.startsWith('+')) {
      current.lines.push({ line: next++, text: raw.slice(1) })
    }
  }
  return files
}

function scanDiffFiles(files) {
  const findings = []
  for (const f of files) {
    const reason = forbiddenPathReason(f.file)
    if (reason) findings.push({ commit: f.commit, file: f.file, line: 0, rule: 'forbidden-file', label: reason, preview: '' })
    for (const hit of scanLines(f.file, f.lines)) findings.push(f.commit ? { commit: f.commit, ...hit } : hit)
  }
  return findings
}

/** What is staged for the next commit, optionally limited to some paths. */
export function scanStaged({ root = process.cwd(), paths = [] } = {}) {
  const top = repoRoot(root)
  const out = git(top, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR', '--', ...paths])
  return scanDiffFiles(parseDiff(out))
}

/** Every line added in the given range (default: everything reachable from any ref). */
export function scanHistory({ root = process.cwd(), range } = {}) {
  const top = repoRoot(root)
  const out = git(top, ['log', '-p', '-U0', '--no-color', '--no-ext-diff', '--format=%x00commit %H', ...(range ? [range] : ['--all'])])
  return scanDiffFiles(parseDiff(out))
}

const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|eot|glb|gltf|bin|hdr|exr|ktx2|mp[34]|webm|mov|wav|ogg|pdf|zip|gz|tgz|br|wasm)$/i

/** Every file git tracks, as it is on disk now. */
export function scanTracked({ root = process.cwd() } = {}) {
  const top = repoRoot(root)
  const findings = []
  for (const file of git(top, ['ls-files', '-z']).split('\0').filter(Boolean)) {
    const reason = forbiddenPathReason(file)
    if (reason) findings.push({ file, line: 0, rule: 'forbidden-file', label: reason, preview: '' })
    if (BINARY_EXT.test(file)) continue
    const abs = path.join(top, file)
    let text
    try {
      if (statSync(abs).size > 5 * 1024 * 1024) continue
      const buf = readFileSync(abs)
      if (buf.subarray(0, 8000).includes(0)) continue
      text = buf.toString('utf8')
    } catch {
      continue // tracked but deleted in the working tree
    }
    findings.push(...scanLines(file, text.split('\n').map((t, i) => ({ line: i + 1, text: t }))))
  }
  return findings
}

function main(argv) {
  const json = argv.includes('--json')
  const rootAt = argv.indexOf('--root')
  const root = rootAt >= 0 ? argv[rootAt + 1] : process.cwd()
  const dashDash = argv.indexOf('--')
  const paths = dashDash >= 0 ? argv.slice(dashDash + 1) : []
  let findings
  let what
  if (argv.includes('--staged')) {
    findings = scanStaged({ root, paths })
    what = 'staged changes'
  } else if (argv.includes('--history')) {
    const at = argv.indexOf('--history')
    const range = argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : undefined
    findings = scanHistory({ root, range })
    what = range ? `history ${range}` : 'all history'
  } else {
    findings = scanTracked({ root })
    what = 'tracked files'
  }
  if (json) {
    process.stdout.write(JSON.stringify({ scanned: what, findings }, null, 2) + '\n')
  } else if (findings.length === 0) {
    process.stdout.write(`check-secrets: ${what} clean\n`)
  } else {
    process.stderr.write(`check-secrets: ${findings.length} possible credential(s) in ${what}:\n`)
    for (const f of findings) {
      const where = `${f.commit ? f.commit.slice(0, 8) + ' ' : ''}${f.file}${f.line ? ':' + f.line : ''}`
      process.stderr.write(`  ${where}  ${f.label}${f.preview ? '  ' + f.preview : ''}\n`)
    }
    process.stderr.write(
      `\nMove real credentials into an environment variable or encrypted settings and rotate anything that\n` +
        `was ever committed. A deliberate fake (test vector, fixture) takes "${ALLOW_MARKER}" on its line.\n`,
    )
  }
  return findings.length === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (err) {
    process.stderr.write(`check-secrets: scan failed - ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  }
}
