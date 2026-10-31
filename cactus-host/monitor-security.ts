// The security picture, gathered every five minutes (updates and the SSH
// configuration hourly): what is waiting to be installed, whether a reboot is
// owed, what fail2ban has banned, which ports answer from outside, and how SSH is
// set up. Everything is read, nothing is changed.

import type { System } from './system.ts'
import type { ListeningPort, SecurityReport } from './monitor-protocol.ts'
import { isLoopback, parseSs, type Proc } from './monitor-proc.ts'

export type SecuritySnapshot = Omit<SecurityReport, 'recentLogins'>

/** `apt-check` prints "updates;security" on stderr. */
export function parseAptCheck(output: string): { total: number; security: number } | null {
  const m = /(\d+);(\d+)/.exec(output)
  return m ? { total: Number(m[1]), security: Number(m[2]) } : null
}

export function parseFail2banStatus(jail: string, output: string): { jail: string; banned: number; totalBanned: number; failed: number } | null {
  const num = (label: string) => {
    const m = new RegExp(`${label}:\\s*(\\d+)`).exec(output)
    return m ? Number(m[1]) : null
  }
  const banned = num('Currently banned')
  if (banned === null) return null
  return { jail, banned, totalBanned: num('Total banned') ?? 0, failed: num('Currently failed') ?? 0 }
}

export function parseSshdT(output: string): { passwordAuth: boolean | null; rootLogin: string | null } {
  const pick = (key: string) => {
    const m = new RegExp(`^${key}\\s+(\\S+)`, 'mi').exec(output)
    return m ? (m[1] as string).toLowerCase() : null
  }
  const pw = pick('passwordauthentication')
  return { passwordAuth: pw === null ? null : pw === 'yes', rootLogin: pick('permitrootlogin') }
}

export class SecurityCollector {
  private readonly system: System
  private readonly proc: Proc
  private slow: { at: number; updates: SecurityReport['updates']; ssh: SecurityReport['ssh'] } | null = null

  constructor(system: System, proc: Proc) {
    this.system = system
    this.proc = proc
  }

  async collect(now: number, expectedPorts: number[]): Promise<SecuritySnapshot> {
    if (!this.slow || now - this.slow.at > 3_600_000) {
      const apt = await this.system.run('/usr/lib/update-notifier/apt-check', [], { timeoutMs: 120_000 })
      const sshd = await this.system.run('sshd', ['-T'], { timeoutMs: 10_000 })
      this.slow = {
        at: now,
        updates: apt.code === 0 ? parseAptCheck(apt.output) : null,
        ssh: sshd.code === 0 ? parseSshdT(sshd.output) : null,
      }
    }

    const reboot = this.proc.read('/var/run/reboot-required') !== null
    const packages = (this.proc.read('/var/run/reboot-required.pkgs') ?? '').split('\n').map((s) => s.trim()).filter(Boolean)

    let fail2ban: SecurityReport['fail2ban'] = null
    const status = await this.system.run('fail2ban-client', ['status'], { timeoutMs: 10_000 })
    if (status.code === 0) {
      const jails = (/Jail list:\s*(.*)$/m.exec(status.output)?.[1] ?? '').split(',').map((j) => j.trim()).filter(Boolean)
      fail2ban = []
      for (const jail of jails.slice(0, 10)) {
        const one = await this.system.run('fail2ban-client', ['status', jail], { timeoutMs: 10_000 })
        const parsed = one.code === 0 ? parseFail2banStatus(jail, one.output) : null
        if (parsed) fail2ban.push(parsed)
      }
    }

    const ss = await this.system.run('ss', ['-H', '-tulpn'], { timeoutMs: 10_000 })
    const expected = new Set(expectedPorts)
    const ports: ListeningPort[] = ss.code === 0
      ? parseSs(ss.output)
          .filter((p) => !isLoopback(p.address))
          // DHCP and the like answer on UDP everywhere and are no business of a web server's checklist.
          .filter((p) => !(p.proto.startsWith('udp') && [53, 67, 68, 123, 323, 546].includes(p.port)))
          .map((p) => ({ ...p, expected: expected.has(p.port) }))
          .sort((a, b) => a.port - b.port)
      : []

    const ufw = await this.system.run('ufw', ['status'], { timeoutMs: 10_000 })
    return {
      at: now,
      updates: this.slow.updates,
      rebootRequired: reboot,
      rebootPackages: packages,
      fail2ban,
      ports,
      ssh: this.slow.ssh,
      firewall: { active: ufw.code === 0 ? /Status:\s*active/.test(ufw.output) : null },
    }
  }
}
