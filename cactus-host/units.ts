// The two systemd units each site runs in: cactus-<site>-a and cactus-<site>-b.
//
// Two slots rather than one unit restarted in place is what makes a deploy free of
// downtime: the new release starts in the idle slot on its own port while the old one
// keeps serving, Caddy is pointed at it only once it has passed its health check, and
// only then is the old slot stopped. Each slot's directory is a symlink to a release,
// which systemd resolves when the unit starts, so pointing a slot at a different
// release is a symlink swap plus a restart.
//
// Units are written per site rather than as one template, because a template cannot
// carry a per-site User= or port. They show up in Cockpit's Services page under the
// same names.

import type { HostConfig } from './config.ts'
import type { SitePaths, SiteRecord, SlotName } from './store.ts'

export function slotUnit(config: HostConfig, site: SiteRecord, paths: SitePaths, slot: SlotName): string {
  const dir = paths.slot(slot)
  const port = site.ports[slot]
  return [
    '# Written by cactus-host. Rewritten whenever the site is updated, so edits here are lost.',
    '[Unit]',
    `Description=Cactus site ${site.id} (slot ${slot})`,
    'After=network-online.target postgresql.service pgbouncer.service',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `User=${site.user}`,
    `Group=${site.user}`,
    `WorkingDirectory=${dir}`,
    // The release's own copy of the env, taken when it was built - a later change to
    // the site's env file reaches the site with the next build, never by surprise on
    // a restart.
    `EnvironmentFile=${dir}/.cactus-env`,
    `Environment=NODE_ENV=production`,
    `Environment=PORT=${port}`,
    `Environment=HOSTNAME=127.0.0.1`,
    `Environment=HOME=${paths.home}`,
    `Environment=NODE_OPTIONS=--max-old-space-size=${config.site.nodeMaxOldSpaceMb}`,
    `ExecStart=${config.nodeBin} ${dir}/node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${port}`,
    'Restart=on-failure',
    'RestartSec=5',
    // SIGTERM lets Next stop taking connections and finish what it has; this is how
    // long it gets before systemd stops waiting.
    'KillSignal=SIGTERM',
    `TimeoutStopSec=${config.stopTimeoutSeconds}`,
    `MemoryMax=${config.site.memoryMax}`,
    'NoNewPrivileges=yes',
    'PrivateTmp=yes',
    'ProtectSystem=strict',
    'ProtectHome=yes',
    `ReadWritePaths=${paths.root}`,
    'ProtectKernelTunables=yes',
    'ProtectControlGroups=yes',
    'RestrictSUIDSGID=yes',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n')
}

/**
 * The systemd-run arguments for one build step, run as the site's user under the
 * build limits: low CPU and IO priority, a CPU quota and a memory ceiling, so a
 * build cannot starve the live sites or Postgres on the same box.
 */
export function buildStepArgs(
  config: HostConfig,
  site: SiteRecord,
  paths: SitePaths,
  releaseDir: string,
  command: string[]
): string[] {
  return [
    '--wait',
    '--pipe',
    '--collect',
    '--quiet',
    `--unit=cactus-build-${site.id}-${Date.now().toString(36)}`,
    `--uid=${site.user}`,
    `--gid=${site.user}`,
    `--working-directory=${releaseDir}`,
    '-p', `EnvironmentFile=${releaseDir}/.cactus-env`,
    '-p', `Nice=${config.build.nice}`,
    '-p', 'IOSchedulingClass=idle',
    '-p', `CPUQuota=${config.build.cpuQuota}`,
    '-p', `MemoryMax=${config.build.memoryMax}`,
    '-p', `RuntimeMaxSec=${config.build.timeoutMinutes * 60}`,
    '-p', 'NoNewPrivileges=yes',
    '-p', 'PrivateTmp=yes',
    `--setenv=HOME=${paths.home}`,
    // npm would otherwise skip devDependencies the build needs if NODE_ENV were
    // ever set; it is not, but the flag on `npm ci` below says so explicitly.
    '--setenv=NODE_OPTIONS=--max-old-space-size=4096',
    '--setenv=CI=1',
    '--setenv=NEXT_TELEMETRY_DISABLED=1',
    '--',
    ...command,
  ]
}
