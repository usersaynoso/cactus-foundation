// Copies of a site's database that cactus-host takes around deploys, so a rollback
// can put the database back as well as the code.
//
// One is taken just before each build's migrations run (they run inside `npm run
// build`), and one just before a rollback replaces the database, so that rollback can
// itself be undone. They live in <stateDir>/snapshots/<site>/, root only, beside an
// index.json listing them newest first. They are not the nightly backups: those go to
// B2 and are kept for a week; these stay on this server and go when nothing needs them.
//
// Which snapshot belongs to which release: a release ran on the database as it was
// when the release stopped being live, and the first snapshot taken after it last
// went live is the nearest copy of that - provided no other build reached its
// migrations in between, which would make it a copy of someone else's database (it
// happens only with builds from before snapshots were taken). Rolling back to it with
// its database restores that snapshot, losing whatever was written after it was taken.

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { HostConfig } from './config.ts'
import { Databases } from './db.ts'
import type { BuildRecord } from './store.ts'
import { writeFileAtomic } from './store.ts'
import type { System } from './system.ts'

export type SnapshotRecord = {
  id: string
  database: string
  file: string
  sizeBytes: number
  /** Epoch ms, when the dump started. */
  takenAt: number
  /** What it was taken before. */
  reason: 'build' | 'rollback'
  /** The build about to run, or the one being rolled back to. */
  buildId: string
}

export class Snapshots {
  readonly config: HostConfig
  readonly system: System
  readonly databases: Databases

  constructor(config: HostConfig, system: System) {
    this.config = config
    this.system = system
    this.databases = new Databases(config, system)
  }

  private dir(siteId: string): string {
    return join(this.config.stateDir, 'snapshots', siteId)
  }

  private index(siteId: string): string {
    return join(this.dir(siteId), 'index.json')
  }

  /** Newest first, only those whose file is still there. */
  list(siteId: string): SnapshotRecord[] {
    let all: SnapshotRecord[]
    try {
      all = JSON.parse(readFileSync(this.index(siteId), 'utf8')) as SnapshotRecord[]
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    return all.filter((s) => existsSync(s.file)).sort((a, b) => b.takenAt - a.takenAt)
  }

  private save(siteId: string, all: SnapshotRecord[]): void {
    writeFileAtomic(this.index(siteId), JSON.stringify(all, null, 2) + '\n')
  }

  async take(siteId: string, database: string, reason: SnapshotRecord['reason'], buildId: string): Promise<SnapshotRecord> {
    const takenAt = this.system.now()
    const stamp = new Date(takenAt).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
    const id = `${stamp}-${reason}-${buildId}`
    const file = join(this.dir(siteId), `${id}.dump`)
    const sizeBytes = await this.databases.dumpTo(database, file)
    const snapshot: SnapshotRecord = { id, database, file, sizeBytes, takenAt, reason, buildId }
    this.save(siteId, [snapshot, ...this.list(siteId).filter((s) => s.id !== id)])
    return snapshot
  }

  /**
   * The snapshot that rolling back to `build` with its database would restore: the
   * first one taken after the build last went live, of the database the site uses now.
   */
  restorePointFor(siteId: string, build: BuildRecord, database: string | null, builds: BuildRecord[]): SnapshotRecord | null {
    if (!database || build.state !== 'ready') return null
    const wentLive = build.liveAt ?? build.finishedAt
    if (wentLive === null) return null
    const after = this.list(siteId).filter((s) => s.database === database && s.takenAt >= wentLive)
    const point = after[after.length - 1]
    if (!point) return null
    const meddled = builds.some((b) => {
      if (b.id === build.id || b.id === point.buildId || b.reachedMigrations === false) return false
      const started = b.startedAt ?? b.createdAt
      return started > wentLive && started < point.takenAt
    })
    return meddled ? null : point
  }

  /**
   * Deletes snapshots nothing needs: kept are each kept release's restore point and the
   * newest `keepReleases`, so a build that failed after migrating still has the copy
   * from before it.
   */
  prune(siteId: string, keptBuilds: BuildRecord[], builds: BuildRecord[], database: string | null, line: (t: string) => void = () => {}): void {
    const all = this.list(siteId)
    const keep = new Set(all.slice(0, this.config.keepReleases).map((s) => s.id))
    for (const b of keptBuilds) {
      if (b.live) continue
      const point = this.restorePointFor(siteId, b, database, builds)
      if (point) keep.add(point.id)
    }
    const gone = all.filter((s) => !keep.has(s.id))
    if (gone.length === 0) return
    for (const s of gone) {
      rmSync(s.file, { force: true })
      line(`Removed old database snapshot ${s.id}`)
    }
    this.save(siteId, all.filter((s) => keep.has(s.id)))
  }
}
