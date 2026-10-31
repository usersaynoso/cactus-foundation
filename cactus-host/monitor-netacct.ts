// Network traffic of each site's own processes - its calls out to Stripe, email
// services, image hosts, other APIs, and the replies - which Caddy never sees.
//
// An nftables table of cactus-host's own, `inet cactus_acct`, that only counts:
//   output  traffic leaving the box from a socket owned by the site's Linux user
//           marks the connection with the user's id and is counted;
//   input   traffic arriving on a connection carrying that mark is counted.
// Loopback is skipped both ways, so Caddy-to-site and site-to-Postgres traffic is
// left out. The table accepts everything; it can never block a packet.
//
// Rewritten whole when the set of sites changes, which resets its counters; a
// counter that goes backwards is read as a fresh start.

import { rmSync, writeFileSync } from 'node:fs'
import type { System } from './system.ts'

export const NFT_TABLE = 'cactus_acct'

export type AccountedSite = { id: string; uid: number }

export function nftRuleset(sites: AccountedSite[]): string {
  const out = sites.map((s) => `    meta skuid ${s.uid} ct mark set ${s.uid} counter comment "${s.id}"`)
  const inn = sites.map((s) => `    ct mark ${s.uid} counter comment "${s.id}"`)
  return [
    `table inet ${NFT_TABLE}`,
    `delete table inet ${NFT_TABLE}`,
    `table inet ${NFT_TABLE} {`,
    '  chain out {',
    '    type filter hook output priority 10; policy accept;',
    '    oifname "lo" return',
    ...out,
    '  }',
    '  chain in {',
    '    type filter hook input priority 10; policy accept;',
    '    iifname "lo" return',
    ...inn,
    '  }',
    '}',
    '',
  ].join('\n')
}

/** Bytes counted per site, from `nft -j list table inet cactus_acct`. */
export function parseNftCounters(json: string): Map<string, { tx: number; rx: number }> {
  const out = new Map<string, { tx: number; rx: number }>()
  let parsed: { nftables?: unknown[] }
  try {
    parsed = JSON.parse(json) as { nftables?: unknown[] }
  } catch {
    return out
  }
  for (const item of parsed.nftables ?? []) {
    const rule = (item as { rule?: { chain?: string; comment?: string; expr?: unknown[] } }).rule
    if (!rule?.comment || !rule.expr) continue
    const counter = rule.expr.map((e) => (e as { counter?: { bytes?: number } }).counter).find(Boolean)
    if (!counter) continue
    const row = out.get(rule.comment) ?? { tx: 0, rx: 0 }
    if (rule.chain === 'out') row.tx += counter.bytes ?? 0
    else if (rule.chain === 'in') row.rx += counter.bytes ?? 0
    out.set(rule.comment, row)
  }
  return out
}

export class NetAccounting {
  private readonly system: System
  private installedFor = ''
  private previous: { at: number; counters: Map<string, { tx: number; rx: number }> } | null = null

  constructor(system: System) {
    this.system = system
  }

  /** Bytes per second each site sent and received since the last call. */
  async sample(sites: AccountedSite[], now: number): Promise<Map<string, { txBps: number; rxBps: number }>> {
    const signature = sites.map((s) => `${s.id}:${s.uid}`).sort().join(',')
    if (signature !== this.installedFor) {
      const file = `/run/cactus-monitor-nft-${process.pid}.nft`
      writeFileSync(file, nftRuleset(sites), { mode: 0o600 })
      try {
        const result = await this.system.run('nft', ['-f', file], { timeoutMs: 10_000 })
        if (result.code !== 0) throw new Error(`nft refused the accounting table: ${result.output.trim().split('\n').slice(-1)[0] ?? ''}`)
      } finally {
        rmSync(file, { force: true })
      }
      this.installedFor = signature
      this.previous = null
    }
    const lines: string[] = []
    const listed = await this.system.run('nft', ['-j', 'list', 'table', 'inet', NFT_TABLE], { timeoutMs: 10_000, onLine: (l) => lines.push(l) })
    if (listed.code !== 0) {
      this.installedFor = ''
      throw new Error('nft could not list the accounting table')
    }
    const counters = parseNftCounters(lines.join('\n'))
    const prev = this.previous
    this.previous = { at: now, counters }
    const out = new Map<string, { txBps: number; rxBps: number }>()
    if (!prev) return out
    const secs = Math.max(1, (now - prev.at) / 1000)
    for (const [site, c] of counters) {
      const p = prev.counters.get(site)
      const tx = p && c.tx >= p.tx ? c.tx - p.tx : c.tx
      const rx = p && c.rx >= p.rx ? c.rx - p.rx : c.rx
      out.set(site, { txBps: tx / secs, rxBps: rx / secs })
    }
    return out
  }
}
