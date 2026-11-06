import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Proc } from './monitor-proc.ts'
import { SecurityCollector } from './monitor-security.ts'
import { monitorDir } from './monitor-settings.ts'
import { installUpdates, parseSimulation, restartServer, updatesFinishedFile, updatesReport } from './monitor-updates.ts'
import type { RunResult } from './system.ts'
import { hostWithSite } from './testing.ts'

// Trimmed from a real run on Ubuntu 26.04.
const SIMULATION = `NOTE: This is only a simulation!
Calculating upgrade...
The following NEW packages will be installed:
  linux-image-7.0.0-43-generic
The following upgrades have been deferred due to phasing:
  base-files motd-news-config vim
  xxd
The following packages will be upgraded:
  ca-certificates caddy linux-generic
3 upgraded, 1 newly installed, 1 to remove and 4 not upgraded.
Remv old-thing [1.0]
Inst ca-certificates [20260816ubuntu0.26.04.1] (20260816ubuntu0.26.04.2 Ubuntu:26.04/resolute-updates, Ubuntu:26.04/resolute-security [all])
Inst caddy [2.11.7] (2.11.9 source=none:any-version [amd64])
Inst linux-image-7.0.0-43-generic (7.0.0-43.43 Ubuntu:26.04/resolute-updates [amd64])
Inst linux-generic [7.0.0-42.42] (7.0.0-43.43 Ubuntu:26.04/resolute-updates [amd64]) []
Conf caddy (2.11.9 source=none:any-version [amd64])
`

/** A host whose fake system answers apt-get and systemctl as told. */
function setup(opts: { active?: string; sim?: RunResult } = {}) {
  const ctx = hostWithSite()
  const inner = ctx.host.system.run.bind(ctx.host.system)
  ctx.host.system.run = async (cmd, args, o) => {
    if (cmd === 'apt-get') {
      ctx.system.calls.push({ cmd, args })
      return opts.sim ?? { code: 0, output: SIMULATION }
    }
    if (cmd === 'systemctl' && args[0] === 'is-active') return { code: 0, output: `${opts.active ?? 'inactive'}\n` }
    return inner(cmd, args, o)
  }
  return ctx
}

describe('parseSimulation', () => {
  it('reads what would be installed, removed and held back', () => {
    const r = parseSimulation(SIMULATION)
    expect(r.packages.map((p) => p.name)).toEqual(['ca-certificates', 'caddy', 'linux-generic', 'linux-image-7.0.0-43-generic'])
    expect(r.packages[0]).toEqual({ name: 'ca-certificates', from: '20260816ubuntu0.26.04.1', to: '20260816ubuntu0.26.04.2', security: true })
    expect(r.packages.find((p) => p.name === 'caddy')?.security).toBe(false)
    expect(r.packages.find((p) => p.name.startsWith('linux-image'))?.from).toBeNull()
    expect(r.removals).toEqual(['old-thing'])
    expect(r.deferred).toEqual(['base-files', 'motd-news-config', 'vim', 'xxd'])
  })
})

describe('installing updates', () => {
  it('reports what is waiting, without taking apt\'s lock', async () => {
    const ctx = setup()
    const r = await updatesReport(ctx.host)
    expect(r.packages).toHaveLength(4)
    expect(r.job).toBeNull()
    expect(ctx.system.calls.find((c) => c.cmd === 'apt-get')?.args).toEqual(['-s', '-o', 'Debug::NoLocking=1', 'dist-upgrade'])
  })

  it('says why when apt will not answer', async () => {
    const ctx = setup({ sim: { code: 100, output: 'Reading package lists...\nE: The package lists are broken\n' } })
    const r = await updatesReport(ctx.host)
    expect(r.packages).toBeNull()
    expect(r.error).toBe('E: The package lists are broken')
  })

  it('runs in its own unit, never prompting and keeping config files', async () => {
    const ctx = setup()
    await installUpdates(ctx.host)
    const args = ctx.system.calls.find((c) => c.cmd === 'systemd-run')?.args as string[]
    expect(args).toEqual(expect.arrayContaining(['--unit=cactus-server-updates.service', '--collect', '--setenv=DEBIAN_FRONTEND=noninteractive', '--setenv=NEEDRESTART_MODE=l']))
    const script = args[args.indexOf('-c') + 1] as string
    expect(script).toContain('--force-confold')
    expect(script).toContain('dist-upgrade')
    // Paths reach the script as arguments, so nothing in them can be read as shell.
    expect(script).not.toContain(ctx.host.config.stateDir)
    expect(args.slice(-2)).toEqual([join(monitorDir(ctx.host.config), 'updates.log'), updatesFinishedFile(ctx.host.config)])
  })

  it('follows the install from running to its result', async () => {
    const ctx = setup({ active: 'active' })
    const job = await installUpdates(ctx.host)
    expect(job.state).toBe('running')
    const running = await updatesReport(ctx.host)
    expect(running.job?.state).toBe('running')
    expect(running.packages).toBeNull()
    expect(ctx.system.calls.some((c) => c.cmd === 'apt-get')).toBe(false)

    writeFileSync(join(monitorDir(ctx.host.config), 'updates.log'), 'Setting up caddy\n')
    writeFileSync(updatesFinishedFile(ctx.host.config), `0 ${Math.ceil(job.startedAt / 1000) + 60}\n`)
    const done = await updatesReport(ctx.host)
    expect(done.job).toMatchObject({ state: 'done', exitCode: 0, log: 'Setting up caddy\n' })
    expect(done.packages).toHaveLength(4)

    writeFileSync(updatesFinishedFile(ctx.host.config), `100 ${Math.ceil(job.startedAt / 1000) + 60}\n`)
    expect((await updatesReport(ctx.host)).job).toMatchObject({ state: 'failed', exitCode: 100 })
  })

  it('will not start a second install on top of the first', async () => {
    const ctx = setup({ active: 'active' })
    await installUpdates(ctx.host)
    await expect(installUpdates(ctx.host)).rejects.toMatchObject({ status: 409 })
    expect(ctx.system.calls.filter((c) => c.cmd === 'systemd-run')).toHaveLength(1)
  })

  it('calls an install that stopped without a result interrupted, and ignores the last run\'s result', async () => {
    const ctx = setup()
    mkdirSync(monitorDir(ctx.host.config), { recursive: true })
    writeFileSync(updatesFinishedFile(ctx.host.config), '0 1000\n')
    await installUpdates(ctx.host)
    expect((await updatesReport(ctx.host)).job?.state).toBe('interrupted')
  })

  it('tells the caller when systemd will not start it', async () => {
    const ctx = setup()
    ctx.system.buildExit = () => 1
    await expect(installUpdates(ctx.host)).rejects.toThrow(/Starting the install failed/)
    expect((await updatesReport(ctx.host)).job).toBeNull()
  })
})

describe('restarting the server', () => {
  function owed(): string {
    const file = join(mkdtempSync(join(tmpdir(), 'reboot-')), 'reboot-required')
    writeFileSync(file, '*** System restart required ***\n')
    return file
  }

  it('is scheduled a minute out, so the answer gets back first', async () => {
    const ctx = setup()
    await restartServer(ctx.host, owed())
    expect(ctx.system.calls.find((c) => c.cmd === 'shutdown')?.args.slice(0, 2)).toEqual(['-r', '+1'])
  })

  it('is refused when nothing needs it', async () => {
    const ctx = setup()
    await expect(restartServer(ctx.host, join(tmpdir(), 'no-such-reboot-file'))).rejects.toMatchObject({ status: 409 })
    expect(ctx.system.calls.some((c) => c.cmd === 'shutdown')).toBe(false)
  })

  it('is refused while updates are installing', async () => {
    const ctx = setup({ active: 'active' })
    await installUpdates(ctx.host)
    await expect(restartServer(ctx.host, owed())).rejects.toThrow(/still being installed/)
  })

  it('is refused while a site is building', async () => {
    const ctx = setup()
    ctx.host.buildsRunning = () => 1
    await expect(restartServer(ctx.host, owed())).rejects.toThrow(/building/)
    expect(ctx.system.calls.some((c) => c.cmd === 'shutdown')).toBe(false)
  })
})

describe('the security collector', () => {
  it('counts again as soon as an install ends, not at the next hour', async () => {
    const ctx = setup()
    const files: Record<string, string> = {}
    const proc: Proc = { read: (p) => files[p] ?? null, list: () => [], statfs: () => null, link: () => null }
    const answers = ['18;1', '0;0']
    const inner = ctx.host.system.run.bind(ctx.host.system)
    ctx.host.system.run = async (cmd, args, o) => (cmd.endsWith('apt-check') ? { code: 0, output: answers.shift() ?? '' } : inner(cmd, args, o))
    const collector = new SecurityCollector(ctx.host.system, proc, '/finished')
    const t = 1_000_000
    expect((await collector.collect(t, [])).updates?.total).toBe(18)
    expect((await collector.collect(t + 300_000, [])).updates?.total).toBe(18)
    files['/finished'] = '0 2000\n'
    expect((await collector.collect(t + 600_000, [])).updates).toEqual({ total: 0, security: 0 })
  })
})
