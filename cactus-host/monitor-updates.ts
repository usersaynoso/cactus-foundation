// The one thing on the Security screen that changes the box: installing the system
// updates that are waiting, and the restart a new kernel leaves owing.
//
// The install runs in a transient unit of its own, not under cactus-host, because
// the update may restart Caddy (cutting off the admin page that asked for it) or
// Node. The unit writes its own log and result, so the screen can pick the story up
// again whatever was restarted along the way.

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HostConfig } from './config.ts'
import { Host, HostError } from './host.ts'
import type { UpdatePackage, UpdatesJob, UpdatesReport } from './monitor-protocol.ts'
import { monitorDir } from './monitor-settings.ts'
import { writeFileAtomic } from './store.ts'
import { mustRun } from './system.ts'

const UNIT = 'cactus-server-updates.service'
const REBOOT_FILE = '/var/run/reboot-required'
const REBOOT_PACKAGES_FILE = '/var/run/reboot-required.pkgs'
const LOG_TAIL = 32 * 1024

// --force-confold keeps any config file we have changed (Caddy's, Postgres's) and
// needrestart is told to list rather than restart, so nothing beyond the packages
// themselves is bounced. $1 is the log, $2 the result: "<exit code> <epoch seconds>".
const SCRIPT = `{ apt-get update && apt-get -y -o DPkg::Lock::Timeout=300 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold dist-upgrade; } >"$1" 2>&1
code=$?
printf '%s %s\\n' "$code" "$(date +%s)" >"$2"
exit "$code"`

function startedFile(config: HostConfig): string {
  return join(monitorDir(config), 'updates-started')
}

function logFile(config: HostConfig): string {
  return join(monitorDir(config), 'updates.log')
}

/** Changes whenever an install ends, which is how the security collector knows its hourly count is out of date. */
export function updatesFinishedFile(config: HostConfig): string {
  return join(monitorDir(config), 'updates-finished')
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** What `apt-get -s dist-upgrade` says would happen. Phased updates are not in `packages`: apt will not install them yet. */
export function parseSimulation(output: string): { packages: UpdatePackage[]; removals: string[]; deferred: string[] } {
  const packages: UpdatePackage[] = []
  const removals: string[] = []
  const deferred: string[] = []
  let inDeferred = false
  for (const line of output.split('\n')) {
    if (/deferred due to phasing:$/.test(line)) {
      inDeferred = true
      continue
    }
    if (inDeferred && line.startsWith('  ')) {
      deferred.push(...line.trim().split(/\s+/))
      continue
    }
    inDeferred = false
    const inst = /^Inst (\S+)(?: \[([^\]]*)\])? \((\S+) ([^[]*)\[/.exec(line)
    if (inst) {
      packages.push({ name: inst[1] as string, from: inst[2] ?? null, to: inst[3] as string, security: (inst[4] as string).includes('-security') })
      continue
    }
    const remv = /^Remv (\S+)/.exec(line)
    if (remv) removals.push(remv[1] as string)
  }
  return { packages: packages.sort((a, b) => Number(b.security) - Number(a.security) || a.name.localeCompare(b.name)), removals, deferred }
}

async function readJob(host: Host): Promise<UpdatesJob | null> {
  const startedAt = Number(readText(startedFile(host.config)))
  if (!startedAt) return null
  const log = (readText(logFile(host.config)) ?? '').slice(-LOG_TAIL)
  // A result from before this install started belongs to the one before it.
  const finished = /^(\d+) (\d+)/.exec(readText(updatesFinishedFile(host.config)) ?? '')
  const finishedAt = finished ? Number(finished[2]) * 1000 : 0
  if (finished && finishedAt >= startedAt - 1000) {
    const exitCode = Number(finished[1])
    return { state: exitCode === 0 ? 'done' : 'failed', startedAt, finishedAt, exitCode, log }
  }
  const active = await host.system.run('systemctl', ['is-active', UNIT], { timeoutMs: 10_000 })
  const running = ['active', 'activating'].includes(active.output.trim())
  return { state: running ? 'running' : 'interrupted', startedAt, finishedAt: null, exitCode: null, log }
}

/** The output of `busctl get-property ... ScheduledShutdown`: `(st) "reboot" <microseconds>`, or an empty type when nothing is scheduled. */
export function parseScheduledShutdown(output: string): number | null {
  const m = /"reboot" (\d+)/.exec(output)
  return m ? Math.floor(Number(m[1]) / 1000) : null
}

/** When logind will restart the box, if it has been asked to. A restart is only known to logind, so this is what survives a page reload. */
async function scheduledRestart(host: Host): Promise<number | null> {
  const result = await host.system.run('busctl', ['get-property', 'org.freedesktop.login1', '/org/freedesktop/login1', 'org.freedesktop.login1.Manager', 'ScheduledShutdown'], { timeoutMs: 10_000 })
  return result.code === 0 ? parseScheduledShutdown(result.output) : null
}

export async function updatesReport(host: Host): Promise<UpdatesReport> {
  const job = await readJob(host)
  const reboot = {
    restartAt: await scheduledRestart(host),
    rebootRequired: existsSync(REBOOT_FILE),
    rebootPackages: (readText(REBOOT_PACKAGES_FILE) ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
  }
  // Mid-install the answer would be half true, and the screen has the log to show instead.
  if (job?.state === 'running') return { packages: null, removals: [], deferred: [], error: null, job, ...reboot }
  // As root a simulation still takes apt's lock, which the daily automatic run holds for minutes at a time.
  const sim = await host.system.run('apt-get', ['-s', '-o', 'Debug::NoLocking=1', 'dist-upgrade'], {
    env: { PATH: process.env.PATH ?? '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C' },
    timeoutMs: 30_000,
  })
  if (sim.code !== 0) {
    const error = sim.output.trim().split('\n').slice(-1)[0] || `apt-get exited ${sim.code}`
    return { packages: null, removals: [], deferred: [], error, job, ...reboot }
  }
  return { ...parseSimulation(sim.output), error: null, job, ...reboot }
}

export async function installUpdates(host: Host): Promise<UpdatesJob> {
  if ((await readJob(host))?.state === 'running') throw new HostError('Updates are already being installed.', 409)
  if (await scheduledRestart(host) !== null) throw new HostError('The server is about to restart. Install once it is back.', 409)
  mkdirSync(monitorDir(host.config), { recursive: true, mode: 0o700 })
  const startedAt = host.system.now()
  await mustRun(host.system, 'Starting the install', 'systemd-run', [
    `--unit=${UNIT}`,
    '--description=Server updates, asked for in Oasis',
    // Without this a failed run would keep the unit's name and block the next try.
    '--collect',
    '--property=RuntimeMaxSec=1800',
    '--setenv=DEBIAN_FRONTEND=noninteractive',
    '--setenv=NEEDRESTART_MODE=l',
    '--setenv=LC_ALL=C',
    '--',
    '/bin/sh', '-c', SCRIPT, 'sh', logFile(host.config), updatesFinishedFile(host.config),
  ], { timeoutMs: 30_000 })
  writeFileAtomic(startedFile(host.config), `${startedAt}\n`)
  return { state: 'running', startedAt, finishedAt: null, exitCode: null, log: '' }
}

/**
 * Restarts the box in a minute, which gives this answer time to get back to the
 * screen, and says when. Asking again changes nothing: a second `shutdown` would
 * replace the first and start the minute over.
 */
export async function restartServer(host: Host, rebootFile = REBOOT_FILE): Promise<number> {
  const already = await scheduledRestart(host)
  if (already !== null) return already
  if (!existsSync(rebootFile)) throw new HostError('The server does not need a restart.', 409)
  if ((await readJob(host))?.state === 'running') throw new HostError('Updates are still being installed. Restart once they have finished.', 409)
  // cactus-host waits for builds when it is stopped, so a restart now could hang for half an hour.
  if (host.buildsRunning() > 0) throw new HostError('A site is building. Restart once it has finished.', 409)
  await mustRun(host.system, 'Scheduling the restart', 'shutdown', ['-r', '+1', 'Restart asked for in Oasis'], { timeoutMs: 15_000 })
  return await scheduledRestart(host) ?? host.system.now() + 60_000
}
