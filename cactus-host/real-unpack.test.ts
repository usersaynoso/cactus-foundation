// The paths the fake system cannot get wrong, run for real: a real git mirror, a real
// `git archive`, a real `tar`, and real directory permissions. The fake's `tar` just
// writes a file, which is why the archive being parked somewhere the site's user could
// not reach got all the way to a real server before anyone saw it.

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeSystem, hostWithSite } from './testing.ts'
import { realSystem } from './system.ts'
import { buildStepArgs, slotUnit } from './units.ts'
import { siteCaddyFile } from './caddy.ts'

const isRoot = process.getuid?.() === 0
const cleanup: string[] = []

afterEach(() => {
  for (const dir of cleanup.splice(0)) {
    try {
      chmodSync(dir, 0o700)
    } catch {
      // already gone
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim()
}

describe('unpacking a release for real', () => {
  // Root can open anything, so on a root-run CI box this cannot show the bug.
  it.skipIf(isRoot)('never touches the state directory\'s tmp, which the site user cannot reach', async () => {
    const system = { ...fakeSystem(), run: realSystem.run }
    const ctx = hostWithSite({ system })

    // A real repo, mirrored bare where the host keeps it.
    const work = mkdtempSync(join(tmpdir(), 'cactus-host-src-'))
    cleanup.push(work)
    git(['init', '-q', '-b', 'main', work])
    mkdirSync(join(work, 'app'))
    writeFileSync(join(work, 'app', 'page.txt'), 'hello')
    writeFileSync(join(work, 'package.json'), '{"name":"site"}')
    git(['-C', work, 'add', '.'])
    git(['-C', work, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'first'])
    const sha = git(['-C', work, 'rev-parse', 'HEAD'])
    mkdirSync(join(ctx.paths.mirror, '..'), { recursive: true })
    git(['clone', '-q', '--bare', work, ctx.paths.mirror])

    // The root-only state directory's tmp, as it is on a server: nobody gets in.
    const tmp = join(ctx.config.stateDir, 'tmp')
    mkdirSync(tmp, { recursive: true })
    chmodSync(tmp, 0o000)
    cleanup.push(tmp)

    const releaseDir = ctx.paths.release('b1')
    await (ctx.host as unknown as { unpackRelease: (s: unknown, p: unknown, sha: string, r: string) => Promise<void> }).unpackRelease(
      ctx.site,
      ctx.paths,
      sha,
      releaseDir
    )

    expect(readFileSync(join(releaseDir, 'app', 'page.txt'), 'utf8')).toBe('hello')
    // The archive is gone again, and left nothing behind in the release.
    expect(existsSync(join(releaseDir, '.cactus-release.tar'))).toBe(false)
    expect(readdirSync(releaseDir).sort()).toEqual(['app', 'package.json'])
  })
})

describe('what a real server is started with', () => {
  it('starts every site on localhost, loopback only, and Caddy dials the same name', () => {
    const ctx = hostWithSite()
    const unit = slotUnit(ctx.config, ctx.site, ctx.paths, 'a')
    expect(unit).toContain('Environment=HOSTNAME=localhost')
    expect(unit).toMatch(/next start -H localhost -p 3100\n/)
    expect(unit).not.toContain('127.0.0.1')
    expect(unit).not.toContain('0.0.0.0')
    const live = { ...ctx.site, liveSlot: 'a' as const }
    expect(siteCaddyFile(ctx.config, live, ctx.paths)).toContain('reverse_proxy localhost:3100')
    expect(buildStepArgs(ctx.config, ctx.site, ctx.paths, '/r', ['true']).join(' ')).not.toContain('127.0.0.1')
  })
})
