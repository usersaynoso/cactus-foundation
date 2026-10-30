// `cactus-host site rename <site> <new-name>`: gives a site a new name (its id), which
// is in every path, unit and record cactus-host keeps for it.
//
// The site is offline for as long as its live release takes to start again, usually
// well under a minute: the two slots keep their ports, so the new unit cannot start
// until the old one has stopped. Nothing is rebuilt. In order:
//   1. both slots are stopped and their old units removed;
//   2. the site directory, record, build history, logs, code mirror and deploy key
//      move to the new name, and the Linux user cactus-<old> becomes cactus-<new>
//      (same uid, so every file keeps its owner);
//   3. the slot links, the kept releases' build history and every copy of the env
//      (CACTUS_HOST_SITE_ID) are pointed at the new name;
//   4. new units are written and the live slot is started and health-checked;
//   5. the Caddy file moves, and the admin token's record follows if this site holds it.
// The database keeps its name: it is found from DATABASE_URL, not from the site's name.
//
// A failure part-way says which steps were done, as `site create` does.

import { existsSync, lstatSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { readAdmin } from './admin.ts'
import { parseEnv, serialiseEnv } from './env-file.ts'
import { ENV_FILE_HEADER, HostError, type Host } from './host.ts'
import { SITE_ID_PATTERN, writeFileAtomic, type SiteRecord, type SlotName } from './store.ts'
import { mustRun } from './system.ts'
import { slotUnit } from './units.ts'

const SLOTS: SlotName[] = ['a', 'b']

function moveIfThere(from: string, to: string): void {
  if (existsSync(from)) renameSync(from, to)
}

export async function renameSite(host: Host, from: string, to: string): Promise<SiteRecord> {
  const site = host.site(from)
  const id = to.trim()
  if (!SITE_ID_PATTERN.test(id)) throw new HostError('A site name is 3 to 24 lower-case letters, digits and hyphens, starting with a letter', 400)
  if (id === from) throw new HostError(`${from} is already called that`, 400)
  if (host.store.getSite(id)) throw new HostError(`There is already a site called ${id} on this server`, 409)
  // The lock below only covers this process; the CLI runs beside the service, so the
  // build records are checked too.
  if (host.store.listBuilds(from).some((b) => b.state === 'queued' || b.state === 'building')) {
    throw new HostError(`${from} is building. Wait for the build to finish, then rename it.`, 409)
  }
  const before = host.store.paths(from)
  const after = host.store.paths(id)
  for (const path of [after.root, after.record, after.builds, after.logs, after.mirror, after.deployKey, after.caddyFile]) {
    if (existsSync(path)) throw new HostError(`${path} already exists, so ${id} cannot be used. Remove it by hand if it is left over.`, 409)
  }
  // A user name cactus-host made follows the site; one somebody chose by hand stays.
  const renameUser = site.user === `cactus-${from}`
  const user = renameUser ? `cactus-${id}` : site.user
  if (renameUser && host.system.lookupUser(user)) throw new HostError(`The Linux user ${user} already exists, so ${id} cannot be used`, 409)

  return host.withSiteLock([from, id], `rename-${from}-${id}`, async () => {
    const done: string[] = []
    const step = async <T>(what: string, work: () => Promise<T> | T): Promise<T> => {
      try {
        const result = await work()
        done.push(what)
        return result
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err)
        throw new Error(`${what} failed: ${why}.${done.length ? ` Already done: ${done.join('; ')}.` : ''}`)
      }
    }

    await step('Stopping the site', async () => {
      for (const slot of SLOTS) {
        await host.system.run('systemctl', ['disable', '--now', '--quiet', before.unit(slot)])
        rmSync(before.unitFile(slot), { force: true })
      }
    })

    await step('Moving its files', () => {
      renameSync(before.root, after.root)
      moveIfThere(before.logs, after.logs)
      moveIfThere(before.mirror, after.mirror)
      moveIfThere(before.deployKey, after.deployKey)
      moveIfThere(`${before.deployKey}.pub`, `${after.deployKey}.pub`)
    })

    if (renameUser) {
      await step(`Renaming the Linux user to ${user}`, async () => {
        await mustRun(host.system, 'Renaming the user', 'usermod', ['--login', user, '--home', after.home, site.user])
        await mustRun(host.system, 'Renaming the group', 'groupmod', ['--new-name', user, site.user])
      })
    }

    const renamed: SiteRecord = { ...site, id, user }
    await step('Moving its records', () => {
      const builds = host.store.listBuilds(from).map((b) => ({
        ...b,
        releaseDir: b.releaseDir?.startsWith(`${before.root}/`) ? after.root + b.releaseDir.slice(before.root.length) : b.releaseDir,
      }))
      writeFileAtomic(after.builds, JSON.stringify(builds, null, 2) + '\n')
      host.store.saveSite(renamed)
      rmSync(before.builds, { force: true })
      rmSync(before.record, { force: true })

      // The slot links name releases by absolute path.
      for (const slot of SLOTS) {
        const link = after.slot(slot)
        let target: string
        try {
          if (!lstatSync(link).isSymbolicLink()) continue
          target = readlinkSync(link)
        } catch {
          continue
        }
        if (!target.startsWith(`${before.root}/`)) continue
        unlinkSync(link)
        symlinkSync(after.root + target.slice(before.root.length), link)
      }
    })

    await step('Updating its settings', () => {
      const env = host.readSiteEnv(renamed)
      env.set('CACTUS_HOST_SITE_ID', id)
      host.writeSiteEnv(renamed, env)
      // Each kept release has its own copy, which its process reads when it starts.
      const owner = host.system.lookupUser(user)
      for (const b of host.store.listBuilds(id)) {
        const file = b.releaseDir ? join(b.releaseDir, '.cactus-env') : null
        if (!file || !existsSync(file)) continue
        const copy = parseEnv(readFileSync(file, 'utf8'))
        copy.set('CACTUS_HOST_SITE_ID', id)
        writeFileAtomic(file, serialiseEnv(copy, ENV_FILE_HEADER), 0o600, owner ? { uid: owner.uid, gid: owner.gid } : undefined)
      }
    })

    await step('Starting it under its new name', async () => {
      for (const slot of SLOTS) writeFileAtomic(after.unitFile(slot), slotUnit(host.config, renamed, after, slot), 0o644)
      await mustRun(host.system, 'Reloading systemd', 'systemctl', ['daemon-reload'])
      if (!renamed.liveSlot) return
      await mustRun(host.system, 'Starting the site', 'systemctl', ['enable', '--now', '--quiet', after.unit(renamed.liveSlot)])
      const expectsDatabase = host.readSiteEnv(renamed).has('DATABASE_URL')
      const health = await host.slotHealthy(renamed, renamed.liveSlot, expectsDatabase)
      if (!health.healthy) {
        throw new Error(`it started but did not pass its health check (${health.reason}). See journalctl -u ${after.unit(renamed.liveSlot)}`)
      }
    })

    await step('Moving its routing', async () => {
      rmSync(before.caddyFile, { force: true })
      await host.writeRouting(renamed)
    })

    const admin = readAdmin(host.config)
    if (admin?.site === from) {
      writeFileAtomic(join(host.config.stateDir, 'admin.json'), JSON.stringify({ ...admin, site: id }, null, 2) + '\n')
    }
    return host.site(id)
  })
}
