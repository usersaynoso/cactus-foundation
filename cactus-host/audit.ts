// The admin audit log: one JSON line per server-wide action - a database made or
// backed up, a site created, the admin token granted or revoked - whether it came
// from the admin API or the command line. Root only, append only, and never a secret
// in it: a line says what was done to what, by whom, and how it ended.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { HostConfig } from './config.ts'

export type AuditActor = 'cli' | 'admin-api'

export type AuditEntry = {
  /** Epoch ms. */
  at: number
  actor: AuditActor
  action: string
  /** The site or database acted on, when there is one. */
  target: string | null
  ok: boolean
  /** Plain-English reason, when it failed. */
  error: string | null
}

export function auditPath(config: HostConfig): string {
  return join(config.stateDir, 'admin-audit.log')
}

export function appendAudit(config: HostConfig, entry: AuditEntry): void {
  const path = auditPath(config)
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  appendFileSync(path, JSON.stringify(entry) + '\n', { mode: 0o600 })
}

/** The newest entries first. A line that will not parse is skipped rather than fatal. */
export function readAudit(config: HostConfig, limit: number): AuditEntry[] {
  let text: string
  try {
    text = readFileSync(auditPath(config), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const out: AuditEntry[] = []
  const lines = text.split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      out.push(JSON.parse(lines[i] as string) as AuditEntry)
    } catch {
      // A half-written line from a crash; the rest of the log still reads.
    }
  }
  return out
}

/** Runs one action and records how it ended, then hands back its result or rethrows. */
export async function audited<T>(
  config: HostConfig,
  now: () => number,
  actor: AuditActor,
  action: string,
  target: string | null,
  work: () => Promise<T>
): Promise<T> {
  try {
    const result = await work()
    appendAudit(config, { at: now(), actor, action, target, ok: true, error: null })
    return result
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    appendAudit(config, { at: now(), actor, action, target, ok: false, error: error.slice(0, 500) })
    throw err
  }
}
