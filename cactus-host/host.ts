// The engine: everything cactus-host does to a site once it exists. The HTTP API
// (http.ts), the scheduler (scheduler.ts) and the CLI (main.ts) are thin layers over
// this class.
//
// One build at a time per site, and a switch-over or rollback counts as one: the
// lock is the `busy` map below, held from the moment a build is accepted until its
// release is live (or has failed). A second start while one runs is answered with
// the running build, which is what lets the Cactus admin "adopt" a build instead of
// stacking another on top - the same contract Vercel and Netlify give it.
//
// A build, in order:
//   1. fetch the commit into the site's bare mirror, with its read-only deploy key;
//   2. unpack exactly that commit into a new release directory, as the site's user;
//   3. copy the site's env file into the release - the release keeps the env it was
//      built with, so a change reaches the site with the next build, as on Vercel;
//   4. `npm ci` and `npm run build` as the site's user, under the build limits
//      (units.ts). The build runs the prebuild, which reconciles the database schema
//      and runs module migrations, exactly as it does on Vercel;
//   5. add the release's static files to the site's shared static directory;
//   6. switch over: start the idle slot on the release, health-check it, point Caddy
//      at it, stop the old slot. A failed health check stops the new slot and leaves
//      the old one serving - nothing a visitor sees has changed;
//   7. prune releases beyond the configured number.

import { chownSync, cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, type WriteStream } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, relative } from 'node:path'
import type { HostConfig } from './config.ts'
import { parseEnv, serialiseEnv, type EnvMap } from './env-file.ts'
import { siteCaddyFile, PROOF_PATH, isValidHostname } from './caddy.ts'
import { waitUntilHealthy } from './health.ts'
import {
  ENV_KEY_PATTERN,
  RESERVED_ENV_KEYS,
  type BuildLogChunk,
  type BuildSummary,
  type BuildTrigger,
  type DomainSummary,
  type EnvKeySummary,
  type EnvWrite,
  type SiteSummary,
  type StartBuildResponse,
} from './protocol.ts'
import { Store, toSummary, writeFileAtomic, type BuildRecord, type SitePaths, type SiteRecord, type SlotName } from './store.ts'
import { mustRun, type System } from './system.ts'
import { buildStepArgs } from './units.ts'

export class HostError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const ENV_FILE_HEADER =
  'Environment for this Cactus site. Written by cactus-host: change it with\n`cactus-host env set` or from the site\'s own admin, not by hand.\nA change reaches the site with its next build.'

/** Keys cactus-host adds to each release's copy of the env, on top of the site's own. */
export const RELEASE_ENV_KEYS = ['CACTUS_HOST_BUILD_ID', 'CACTUS_HOST_COMMIT_SHA'] as const

const SHA_PATTERN = /^[0-9a-f]{7,40}$/

function newBuildId(now: number): string {
  const stamp = new Date(now).toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `${stamp}-${randomBytes(3).toString('hex')}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class Host {
  readonly config: HostConfig
  readonly store: Store
  readonly system: System
  /** siteId -> the build holding that site's lock. */
  private readonly busy = new Map<string, string>()
  /** Builds still running, so the API can wait on one in tests and on shutdown. */
  private readonly running = new Map<string, Promise<void>>()
  private readonly log: (message: string) => void
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    config: HostConfig,
    system: System,
    opts: { log?: (message: string) => void; sleep?: (ms: number) => Promise<void> } = {}
  ) {
    this.config = config
    this.store = new Store(config)
    this.system = system
    this.log = opts.log ?? ((m) => console.log(m))
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  // ── Sites ──────────────────────────────────────────────────────────────────

  site(siteId: string): SiteRecord {
    const site = this.store.getSite(siteId)
    if (!site) throw new HostError(`There is no site called "${siteId}" on this server`, 404)
    return site
  }

  summary(site: SiteRecord): SiteSummary {
    const live = this.store.listBuilds(site.id).find((b) => b.live) ?? null
    return {
      id: site.id,
      name: site.name,
      repo: site.repo,
      branch: site.branch,
      domains: site.domains,
      publicAddress: this.config.publicAddress,
      liveBuildId: live?.id ?? null,
      liveSha: live?.sha || null,
    }
  }

  private owner(site: SiteRecord): { uid: number; gid: number } {
    const user = this.system.lookupUser(site.user)
    if (!user) throw new HostError(`The Linux user "${site.user}" for site ${site.id} does not exist`, 500)
    return { uid: user.uid, gid: user.gid }
  }

  /** Called once at start-up: a build cannot survive its service restarting. */
  recoverInterruptedBuilds(): void {
    for (const site of this.store.listSites()) {
      for (const build of this.store.listBuilds(site.id)) {
        if (build.state !== 'queued' && build.state !== 'building') continue
        if (build.releaseDir && !build.live) rmSync(build.releaseDir, { recursive: true, force: true })
        this.store.saveBuild(site.id, {
          ...build,
          state: 'error',
          error: 'cactus-host was restarted while this build was running. Start it again.',
          finishedAt: this.system.now(),
          releaseDir: build.live ? build.releaseDir : null,
        })
      }
    }
  }

  // ── Environment ────────────────────────────────────────────────────────────

  readSiteEnv(site: SiteRecord): EnvMap {
    try {
      return parseEnv(readFileSync(this.store.paths(site.id).env, 'utf8'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Map()
      throw err
    }
  }

  writeSiteEnv(site: SiteRecord, env: EnvMap): void {
    writeFileAtomic(this.store.paths(site.id).env, serialiseEnv(env, ENV_FILE_HEADER), 0o600, this.owner(site))
  }

  listEnvKeys(siteId: string): EnvKeySummary[] {
    const site = this.site(siteId)
    const secret = new Set(site.secretKeys)
    return [...this.readSiteEnv(site).keys()].sort().map((key) => ({ key, secret: secret.has(key) }))
  }

  /** Values of the requested keys. A secret key maps to null; a key that is not set is left out. */
  readEnvValues(siteId: string, keys: string[]): Record<string, string | null> {
    const site = this.site(siteId)
    const secret = new Set(site.secretKeys)
    const env = this.readSiteEnv(site)
    const out: Record<string, string | null> = {}
    for (const key of keys) {
      if (!env.has(key)) continue
      out[key] = secret.has(key) ? null : (env.get(key) ?? null)
    }
    return out
  }

  writeEnv(siteId: string, vars: EnvWrite[]): void {
    const site = this.site(siteId)
    for (const v of vars) {
      if (!ENV_KEY_PATTERN.test(v.key)) throw new HostError(`"${v.key}" is not a valid environment variable name`, 400)
      if (RESERVED_ENV_KEYS.includes(v.key) || (RELEASE_ENV_KEYS as readonly string[]).includes(v.key)) {
        throw new HostError(`${v.key} is managed by cactus-host and cannot be changed this way`, 400)
      }
      if (typeof v.value !== 'string') throw new HostError(`The value for ${v.key} must be text`, 400)
    }
    const env = this.readSiteEnv(site)
    const secret = new Set(site.secretKeys)
    for (const v of vars) {
      env.set(v.key, v.value)
      if (v.secret) secret.add(v.key)
      else secret.delete(v.key)
    }
    this.writeSiteEnv(site, env)
    this.store.saveSite({ ...site, secretKeys: [...secret].sort() })
  }

  deleteEnv(siteId: string, keys: string[]): { deleted: string[]; failed: Array<{ key: string; error: string }> } {
    const site = this.site(siteId)
    const env = this.readSiteEnv(site)
    const deleted: string[] = []
    const failed: Array<{ key: string; error: string }> = []
    for (const key of keys) {
      if (RESERVED_ENV_KEYS.includes(key)) {
        failed.push({ key, error: 'managed by cactus-host' })
        continue
      }
      if (env.delete(key)) deleted.push(key)
    }
    if (deleted.length > 0) {
      this.writeSiteEnv(site, env)
      this.store.saveSite({ ...site, secretKeys: site.secretKeys.filter((k) => !deleted.includes(k)) })
    }
    return { deleted, failed }
  }

  // ── Builds ─────────────────────────────────────────────────────────────────

  listBuilds(siteId: string, limit: number): BuildSummary[] {
    this.site(siteId)
    return this.store.listBuilds(siteId).slice(0, Math.max(1, Math.min(limit, 50))).map(toSummary)
  }

  getBuild(siteId: string, buildId: string): BuildSummary {
    this.site(siteId)
    const build = this.store.getBuild(siteId, buildId)
    if (!build) throw new HostError(`No build ${buildId} for ${siteId}`, 404)
    return toSummary(build)
  }

  startBuild(siteId: string, opts: { sha?: string; trigger?: BuildTrigger } = {}): StartBuildResponse {
    const site = this.site(siteId)
    if (opts.sha !== undefined && !SHA_PATTERN.test(opts.sha)) throw new HostError('sha must be a commit hash', 400)

    const busyWith = this.busy.get(siteId)
    if (busyWith) {
      const running = this.store.getBuild(siteId, busyWith)
      if (running) return { build: toSummary(running), alreadyRunning: true }
      throw new HostError('The site is being rolled back. Wait for that to finish, then build.', 409)
    }

    const now = this.system.now()
    const build: BuildRecord = {
      id: newBuildId(now),
      sha: opts.sha ?? '',
      ref: site.branch,
      state: 'queued',
      createdAt: now,
      finishedAt: null,
      error: null,
      live: false,
      trigger: opts.trigger ?? 'api',
      releaseDir: null,
      slot: null,
    }
    this.store.saveBuild(siteId, build)
    this.busy.set(siteId, build.id)
    const job = this.runBuild(site, build).finally(() => {
      this.busy.delete(siteId)
      this.running.delete(build.id)
    })
    this.running.set(build.id, job)
    return { build: toSummary(build), alreadyRunning: false }
  }

  /** Resolves once the build has finished, whatever the outcome. For tests and shutdown. */
  async waitForBuild(buildId: string): Promise<void> {
    await this.running.get(buildId)
  }

  async waitForAll(): Promise<void> {
    await Promise.all([...this.running.values()])
  }

  readLog(siteId: string, buildId: string, since: number): BuildLogChunk {
    const build = this.store.getBuild(siteId, buildId)
    if (!build) throw new HostError(`No build ${buildId} for ${siteId}`, 404)
    const finished = build.state !== 'queued' && build.state !== 'building'
    let text = ''
    try {
      const buf = readFileSync(this.store.paths(siteId).log(buildId))
      text = buf.subarray(Math.min(since, buf.length)).toString('utf8')
    } catch {
      text = ''
    }
    // Only whole lines, so a line being written as this reads is never split in two.
    const lastNewline = text.lastIndexOf('\n')
    const usable = finished ? text : lastNewline === -1 ? '' : text.slice(0, lastNewline + 1)
    const lines = usable.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    const next = since + Buffer.byteLength(usable, 'utf8')
    return { lines, next, done: finished && usable.length === text.length }
  }

  private openLog(siteId: string, buildId: string): { stream: WriteStream; line: (text: string) => void; step: (title: string) => void } {
    const paths = this.store.paths(siteId)
    mkdirSync(paths.logs, { recursive: true, mode: 0o700 })
    const stream = createWriteStream(paths.log(buildId), { flags: 'a', mode: 0o600 })
    const line = (text: string) => {
      stream.write(`${text}\n`)
    }
    const step = (title: string) => line(`──── ${title} ────`)
    return { stream, line, step }
  }

  private async runBuild(site: SiteRecord, initial: BuildRecord): Promise<void> {
    let build: BuildRecord = { ...initial, state: 'building' }
    const save = (patch: Partial<BuildRecord>) => {
      build = { ...build, ...patch }
      this.store.saveBuild(site.id, build)
    }
    save({})
    const paths = this.store.paths(site.id)
    const { stream, line, step } = this.openLog(site.id, build.id)
    this.log(`[${site.id}] build ${build.id} started`)

    try {
      step('Fetching the code')
      const sha = await this.fetchCommit(site, paths, build.sha || null, line)
      save({ sha })
      line(`Building ${site.repo} at ${sha.slice(0, 7)} (${site.branch})`)

      const releaseDir = paths.release(build.id)
      save({ releaseDir })
      await this.unpackRelease(site, paths, sha, releaseDir)

      const env = this.readSiteEnv(site)
      env.set('CACTUS_HOST_BUILD_ID', build.id)
      env.set('CACTUS_HOST_COMMIT_SHA', sha)
      writeFileAtomic(join(releaseDir, '.cactus-env'), serialiseEnv(env, ENV_FILE_HEADER), 0o600, this.owner(site))

      step('Installing dependencies')
      await this.buildStep(site, paths, releaseDir, [this.config.npmBin, 'ci', '--include=dev', '--no-audit', '--no-fund'], line, 'Installing dependencies')

      step('Building')
      await this.buildStep(site, paths, releaseDir, [this.config.npmBin, 'run', 'build'], line, 'The build')

      this.publishStatic(paths, releaseDir)

      step('Switching over')
      const slot = await this.activate(site.id, releaseDir, line, env.has('DATABASE_URL'))
      save({ state: 'ready', finishedAt: this.system.now(), slot, live: true })
      this.store.setLiveBuild(site.id, build.id)
      line('Live.')
      this.log(`[${site.id}] build ${build.id} is live in slot ${slot}`)

      this.prune(site.id, line)
    } catch (err) {
      const message = errorMessage(err)
      line(`Failed: ${message}`)
      if (build.releaseDir && !build.live) rmSync(build.releaseDir, { recursive: true, force: true })
      save({ state: 'error', error: message, finishedAt: this.system.now(), releaseDir: null })
      this.log(`[${site.id}] build ${build.id} failed: ${message}`)
    } finally {
      await new Promise<void>((resolve) => stream.end(resolve))
    }
  }

  private gitEnv(paths: SitePaths): Record<string, string> {
    return {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      GIT_TERMINAL_PROMPT: '0',
      GIT_SSH_COMMAND: `ssh -i ${paths.deployKey} -o IdentitiesOnly=yes -o UserKnownHostsFile=${paths.knownHosts} -o StrictHostKeyChecking=accept-new -o BatchMode=yes`,
    }
  }

  private async fetchCommit(site: SiteRecord, paths: SitePaths, sha: string | null, line: (t: string) => void): Promise<string> {
    const env = this.gitEnv(paths)
    const git = (what: string, args: string[]) => mustRun(this.system, what, 'git', args, { env, onLine: line })
    if (!existsSync(paths.mirror)) {
      mkdirSync(paths.mirror, { recursive: true, mode: 0o700 })
      await git('Preparing the code mirror', ['init', '--bare', '--quiet', paths.mirror])
      await git('Preparing the code mirror', ['-C', paths.mirror, 'remote', 'add', 'origin', `git@github.com:${site.repo}.git`])
    }
    await git('Fetching from GitHub', [
      '-C', paths.mirror, 'fetch', '--prune', '--quiet', 'origin',
      `+refs/heads/${site.branch}:refs/heads/${site.branch}`,
    ])
    const ref = sha ?? `refs/heads/${site.branch}`
    const resolved = await this.system.run('git', ['-C', paths.mirror, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { env })
    const full = resolved.output.trim().split('\n').pop() ?? ''
    if (resolved.code !== 0 || !/^[0-9a-f]{40}$/.test(full)) {
      throw new Error(sha ? `Commit ${sha} is not on ${site.branch} in ${site.repo}` : `Branch ${site.branch} was not found in ${site.repo}`)
    }
    return full
  }

  private async unpackRelease(site: SiteRecord, paths: SitePaths, sha: string, releaseDir: string): Promise<void> {
    const owner = this.owner(site)
    mkdirSync(paths.releases, { recursive: true, mode: 0o750 })
    mkdirSync(releaseDir, { mode: 0o750 })
    chownSync(releaseDir, owner.uid, owner.gid)
    const archive = join(this.config.stateDir, 'tmp', `${site.id}-${sha}.tar`)
    mkdirSync(join(this.config.stateDir, 'tmp'), { recursive: true, mode: 0o700 })
    try {
      await mustRun(this.system, 'Exporting the commit', 'git', ['-C', paths.mirror, 'archive', '--format=tar', `--output=${archive}`, sha], {
        env: this.gitEnv(paths),
      })
      chownSync(archive, owner.uid, owner.gid)
      await mustRun(this.system, 'Unpacking the commit', 'tar', ['-xf', archive, '-C', releaseDir, '--no-same-owner'], {
        uid: owner.uid,
        gid: owner.gid,
      })
    } finally {
      rmSync(archive, { force: true })
    }
  }

  private async buildStep(
    site: SiteRecord,
    paths: SitePaths,
    releaseDir: string,
    command: string[],
    line: (t: string) => void,
    what: string
  ): Promise<void> {
    const result = await this.system.run('systemd-run', buildStepArgs(this.config, site, paths, releaseDir, command), {
      onLine: line,
      timeoutMs: (this.config.build.timeoutMinutes + 1) * 60_000,
    })
    if (result.code !== 0) throw new Error(`${what} failed (exit ${result.code}). The log above says why.`)
  }

  /** Adds a release's content-hashed static files to the shared directory Caddy serves them from. */
  private publishStatic(paths: SitePaths, releaseDir: string): void {
    const source = join(releaseDir, '.next', 'static')
    if (!existsSync(source)) return
    const target = join(paths.static, '_next', 'static')
    mkdirSync(target, { recursive: true, mode: 0o755 })
    // Never overwrite: the names are content hashes, so an existing file is already right.
    cpSync(source, target, { recursive: true, force: false, errorOnExist: false })
  }

  // ── Switch-over ────────────────────────────────────────────────────────────

  /**
   * Starts the idle slot on `releaseDir`, waits until it is healthy, points Caddy at
   * it, then stops the slot that was serving. Throws, with the old slot still
   * serving, if the new one never becomes healthy. Returns the slot now live.
   */
  private async activate(siteId: string, releaseDir: string, line: (t: string) => void, expectsDatabase: boolean): Promise<SlotName> {
    const site = this.site(siteId)
    const paths = this.store.paths(siteId)
    const previous = site.liveSlot
    const next: SlotName = previous === 'a' ? 'b' : 'a'
    const systemctl = (what: string, ...args: string[]) => mustRun(this.system, what, 'systemctl', args)

    mkdirSync(paths.slots, { recursive: true, mode: 0o755 })
    const link = paths.slot(next)
    const tmpLink = `${link}.next`
    rmSync(tmpLink, { force: true })
    symlinkSync(releaseDir, tmpLink)
    renameSync(tmpLink, link)

    line(`Starting the new version on port ${site.ports[next]}`)
    await systemctl('Starting the new version', 'restart', paths.unit(next))

    const health = await waitUntilHealthy(
      this.system,
      { port: site.ports[next], host: site.domains[0] ?? '127.0.0.1', expectsDatabase },
      this.config.healthTimeoutSeconds * 1000,
      this.sleep
    )
    if (!health.healthy) {
      await this.system.run('systemctl', ['stop', paths.unit(next)])
      throw new Error(
        `The new version did not start properly (${health.reason}), so the site is still running the previous one. Its own log is in \`journalctl -u ${paths.unit(next)}\`.`
      )
    }
    line('Health check passed')

    const switched: SiteRecord = { ...site, liveSlot: next }
    try {
      await this.writeRouting(switched)
    } catch (err) {
      await this.writeRouting(site).catch(() => undefined)
      await this.system.run('systemctl', ['stop', paths.unit(next)])
      throw new Error(`Caddy would not take the new version (${errorMessage(err)}), so the site is still running the previous one.`)
    }
    this.store.saveSite(switched)
    line('Traffic switched')

    await systemctl('Enabling the new version at boot', 'enable', '--quiet', paths.unit(next))
    if (previous) {
      // A moment for Caddy's reload to finish handing over open connections, then
      // the old release gets its SIGTERM and stopTimeoutSeconds to finish its work.
      await this.sleep(2_000)
      await this.system.run('systemctl', ['disable', '--quiet', paths.unit(previous)])
      await this.system.run('systemctl', ['stop', paths.unit(previous)])
      line('Previous version stopped')
    }
    return next
  }

  /** Writes the site's Caddy file and reloads Caddy. Throws if Caddy refuses it. */
  async writeRouting(site: SiteRecord): Promise<void> {
    const paths = this.store.paths(site.id)
    writeFileAtomic(paths.caddyFile, siteCaddyFile(this.config, site, paths), 0o644)
    const [cmd, ...args] = this.config.caddyReload
    if (!cmd) return
    await mustRun(this.system, 'Reloading Caddy', cmd, args)
  }

  /**
   * Puts an earlier release back live, without building anything. Defaults to the
   * newest finished build that is not live and whose release is still on disk.
   */
  async rollback(siteId: string, buildId?: string): Promise<BuildSummary> {
    this.site(siteId)
    if (this.busy.has(siteId)) throw new HostError('A build is running for this site. Wait for it to finish, then roll back.', 409)
    const builds = this.store.listBuilds(siteId)
    const target = buildId
      ? builds.find((b) => b.id === buildId)
      : builds.find((b) => !b.live && b.state === 'ready' && b.releaseDir && existsSync(b.releaseDir))
    if (!target) throw new HostError(buildId ? `No build ${buildId} for ${siteId}` : 'There is no earlier version kept on this server to go back to', 404)
    if (target.live) throw new HostError('That version is already live', 409)
    if (target.state !== 'ready' || !target.releaseDir || !existsSync(target.releaseDir)) {
      throw new HostError('That version is no longer kept on this server', 409)
    }

    const lockId = `rollback-${target.id}`
    this.busy.set(siteId, lockId)
    try {
      const releaseDir = target.releaseDir
      const expectsDatabase = parseEnv(readFileSync(join(releaseDir, '.cactus-env'), 'utf8')).has('DATABASE_URL')
      const slot = await this.activate(siteId, releaseDir, (t) => this.log(`[${siteId}] rollback: ${t}`), expectsDatabase)
      this.store.saveBuild(siteId, { ...target, slot, live: true })
      this.store.setLiveBuild(siteId, target.id)
      this.log(`[${siteId}] rolled back to ${target.id}`)
      return toSummary({ ...target, slot, live: true })
    } finally {
      this.busy.delete(siteId)
    }
  }

  /** Removes releases beyond keepReleases (never the live one), and their static files. */
  prune(siteId: string, line: (t: string) => void = () => {}): void {
    const builds = this.store.listBuilds(siteId)
    const kept = builds.filter((b) => b.releaseDir && existsSync(b.releaseDir))
    const keep = new Set<string>()
    const live = kept.find((b) => b.live)
    if (live) keep.add(live.id)
    for (const b of kept) {
      if (keep.size >= this.config.keepReleases) break
      if (b.state === 'ready') keep.add(b.id)
    }
    for (const b of kept) {
      if (keep.has(b.id) || !b.releaseDir) continue
      rmSync(b.releaseDir, { recursive: true, force: true })
      this.store.saveBuild(siteId, { ...b, releaseDir: null })
      line(`Removed old release ${b.id}`)
    }
    this.pruneStatic(siteId, builds.filter((b) => keep.has(b.id)).map((b) => b.releaseDir as string))
  }

  private pruneStatic(siteId: string, releaseDirs: string[]): void {
    const target = join(this.store.paths(siteId).static, '_next', 'static')
    if (!existsSync(target)) return
    const wanted = new Set<string>()
    for (const dir of releaseDirs) {
      const source = join(dir, '.next', 'static')
      if (existsSync(source)) for (const file of walk(source)) wanted.add(relative(source, file))
    }
    for (const file of walk(target)) {
      if (!wanted.has(relative(target, file))) unlinkSync(file)
    }
  }

  // ── Domains ────────────────────────────────────────────────────────────────

  async addDomain(siteId: string, name: string): Promise<DomainSummary> {
    const site = this.site(siteId)
    const domain = name.trim().toLowerCase()
    if (!isValidHostname(domain)) throw new HostError(`"${name}" is not a valid domain name`, 400)
    const other = this.store.listSites().find((s) => s.id !== siteId && s.domains.includes(domain))
    if (other) throw new HostError(`${domain} already belongs to another site on this server`, 409)
    if (!site.domains.includes(domain)) {
      const updated = { ...site, domains: [...site.domains, domain] }
      await this.writeRouting(updated)
      this.store.saveSite(updated)
    }
    return this.domainStatus(siteId, domain)
  }

  /** Whether https://<domain> reaches this site on this server, by asking for the site's proof value. */
  async domainStatus(siteId: string, name: string): Promise<DomainSummary> {
    const site = this.site(siteId)
    const domain = name.trim().toLowerCase()
    if (!site.domains.includes(domain)) throw new HostError(`${domain} is not attached to ${siteId}`, 404)
    try {
      const res = await this.system.fetch(`https://${domain}${PROOF_PATH}?check=${randomBytes(6).toString('hex')}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'cactus-host-domain-check/1' },
      })
      const body = res.status === 200 ? (await res.text()).trim() : ''
      return { name: domain, serving: body === site.proof }
    } catch {
      return { name: domain, serving: false }
    }
  }
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() || statSync(full).isFile()) out.push(full)
  }
  return out
}
