// A pretend server for the tests: a temporary directory tree standing in for /srv,
// /var/lib and /etc, and a System whose commands are recorded and acted out rather
// than run. git "fetches" a fixed commit; tar "unpacks" a tiny project; the build
// step writes a .next/static file; systemctl and the Caddy reload just succeed.
// Health checks answer whatever the test says they should.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, type HostConfig } from './config.ts'
import { Host } from './host.ts'
import { serialiseEnv } from './env-file.ts'
import type { SiteRecord } from './store.ts'
import type { LocalRequest, LocalResponse, RunOptions, RunResult, System } from './system.ts'
import { hashToken } from './tokens.ts'

export const FAKE_SHA = 'abcdef0123456789abcdef0123456789abcdef01'

export type FakeCall = { cmd: string; args: string[] }

export type FakeSystem = System & {
  calls: FakeCall[]
  /** Return false from this to make a release unhealthy. */
  healthy: (port: number) => boolean
  /** Return a non-zero exit to fail a build step. */
  buildExit: (command: string[]) => number
  clock: number
  proofs: Map<string, string>
  requests: LocalRequest[]
  /** While set, build steps wait for it - to hold a build open mid-test. */
  hold: Promise<void> | null
  /** Non-zero to make pg_dump fail. */
  dumpExit: number
  /** Answers a request to a site's port before the defaults do, when it returns one. */
  answer: (req: LocalRequest) => LocalResponse | null
}

export function fakeSystem(): FakeSystem {
  const uid = process.getuid?.() ?? 0
  const gid = process.getgid?.() ?? 0
  const sys: FakeSystem = {
    calls: [],
    healthy: () => true,
    buildExit: () => 0,
    clock: Date.parse('2026-10-30T12:00:00Z'),
    proofs: new Map(),
    requests: [],
    hold: null,
    dumpExit: 0,
    answer: () => null,
    async run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
      sys.calls.push({ cmd, args })
      if (cmd === 'git' && args.includes('rev-parse')) {
        const ref = args[args.length - 1] ?? ''
        return ref.startsWith('deadbeef') ? { code: 1, output: '' } : { code: 0, output: `${FAKE_SHA}\n` }
      }
      if (cmd === 'git' && args.includes('archive')) {
        const out = args.find((a) => a.startsWith('--output='))?.slice('--output='.length)
        if (out) writeFileSync(out, 'tar')
        return { code: 0, output: '' }
      }
      if (cmd === 'tar') {
        const dest = args[args.indexOf('-C') + 1] as string
        writeFileSync(join(dest, 'package.json'), '{"name":"site"}')
        writeFileSync(join(dest, 'cactus-host.json'), '{"crons":[{"path":"/api/cron/dispatch","schedule":"*/5 * * * *"}]}')
        return { code: 0, output: '' }
      }
      if (cmd === 'sh' && args[1]?.includes('pg_dump')) {
        // pg_dump -Fc -d <db> > <file>
        if (sys.dumpExit !== 0) return { code: sys.dumpExit, output: 'pg_dump: error: connection failed' }
        writeFileSync(args[4] as string, `dump of ${args[3]}`)
        return { code: 0, output: '' }
      }
      if (cmd === 'systemd-run') {
        const command = args.slice(args.indexOf('--') + 1)
        const cwd = args.find((a) => a.startsWith('--working-directory='))?.slice('--working-directory='.length) ?? ''
        opts.onLine?.(`$ ${command.join(' ')}`)
        if (sys.hold) await sys.hold
        const code = sys.buildExit(command)
        if (code === 0 && command.includes('build')) {
          mkdirSync(join(cwd, '.next', 'static', 'chunks'), { recursive: true })
          writeFileSync(join(cwd, '.next', 'static', 'chunks', `${cwd.split('/').pop()}.js`), 'js')
        }
        return { code, output: code === 0 ? '' : 'npm ERR! it went wrong' }
      }
      return { code: 0, output: '' }
    },
    lookupUser: () => ({ uid, gid, home: '/nonexistent' }),
    async fetch(url: string): Promise<Response> {
      const u = new URL(url)
      const proof = sys.proofs.get(u.hostname)
      return proof ? new Response(proof, { status: 200 }) : new Response('nope', { status: 404 })
    },
    async local(req: LocalRequest): Promise<LocalResponse> {
      sys.requests.push(req)
      const answered = sys.answer(req)
      if (answered) return answered
      // An unhealthy release behaves like a site that cannot reach its database:
      // /api/health says so, and every page sends the visitor to the setup wizard.
      if (!sys.healthy(req.port)) {
        return req.path === '/api/health'
          ? { status: 503, body: JSON.stringify({ status: 'error', database: 'disconnected' }) }
          : { status: 307, body: '' }
      }
      return req.path === '/api/health'
        ? { status: 200, body: JSON.stringify({ status: 'ok' }) }
        : { status: 200, body: '<html></html>' }
    },
    now: () => (sys.clock += 1000),
  }
  return sys
}

export function testConfig(): HostConfig {
  const root = mkdtempSync(join(tmpdir(), 'cactus-host-'))
  return {
    ...DEFAULT_CONFIG,
    sitesRoot: join(root, 'srv'),
    stateDir: join(root, 'state'),
    keysDir: join(root, 'keys'),
    caddySitesDir: join(root, 'caddy'),
    systemdDir: join(root, 'systemd'),
    keepReleases: 3,
    healthTimeoutSeconds: 5,
    backupDir: join(root, 'backups'),
  }
}

export const TEST_TOKEN = 'chs_test-token'

/** A host with one site, `shop`, already added - the state `cactus-host site add` leaves. */
export function hostWithSite(opts: { env?: Record<string, string>; domains?: string[]; system?: System } = {}) {
  const config = testConfig()
  const system = (opts.system ?? fakeSystem()) as FakeSystem
  const host = new Host(config, system, { log: () => {}, sleep: async () => {} })
  const site: SiteRecord = {
    id: 'shop',
    name: 'The Shop',
    repo: 'example/shop-site',
    branch: 'main',
    user: 'cactus-shop',
    ports: { a: 3100, b: 3101 },
    liveSlot: null,
    domains: opts.domains ?? ['shop.example.com'],
    secretKeys: ['SESSION_SECRET'],
    tokenHash: hashToken(TEST_TOKEN),
    proof: 'proof-value',
    createdAt: 0,
  }
  host.store.saveSite(site)
  const paths = host.store.paths('shop')
  mkdirSync(paths.root, { recursive: true })
  writeFileSync(
    paths.env,
    serialiseEnv(
      new Map(
        Object.entries({
          CACTUS_HOSTING_PROVIDER: 'server',
          CACTUS_HOST_SITE_ID: 'shop',
          CACTUS_HOST_TOKEN: TEST_TOKEN,
          SESSION_SECRET: 'very-secret',
          SITE_URL: 'https://shop.example.com',
          ...(opts.env ?? {}),
        })
      )
    )
  )
  return { config, system, host, site, paths }
}

/** A fake Postgres cluster (psql answers from a list of databases and roles), plus a working ssh-keygen for `site add`. */
export function withCluster(sys: FakeSystem, existing: { databases?: string[]; roles?: string[] } = {}) {
  const databases = new Set(existing.databases ?? [])
  const roles = new Set(existing.roles ?? [])
  const base = sys.run.bind(sys)
  sys.run = async (cmd: string, args: string[], opts?: RunOptions) => {
    if (cmd === 'ssh-keygen') {
      sys.calls.push({ cmd, args })
      const file = args[args.indexOf('-f') + 1] as string
      writeFileSync(file, 'private')
      writeFileSync(`${file}.pub`, 'ssh-ed25519 AAAA cactus-host test')
      return { code: 0, output: '' }
    }
    if (cmd !== 'runuser' && cmd !== 'sh' && cmd !== 'rclone') return base(cmd, args, opts)
    if (cmd === 'sh' && args[1]?.includes('pg_dump')) return base(cmd, args, opts)
    sys.calls.push({ cmd, args })
    const sql = args[args.indexOf('-c') + 1] ?? ''
    if (args.includes('psql') && sql.startsWith('select (select count(*)')) {
      const name = /datname = '([a-z0-9_]+)'/.exec(sql)?.[1] ?? ''
      return { code: 0, output: `${databases.has(name) ? 1 : 0}\t${roles.has(name) ? 1 : 0}\n` }
    }
    if (args.includes('psql') && sql.startsWith('select datname')) {
      return { code: 0, output: [...databases].map((d) => `${d}\t${d}\t2097152`).join('\n') + '\n' }
    }
    if (args.includes('psql') && sql.startsWith('CREATE ROLE')) {
      roles.add(/CREATE ROLE ([a-z0-9_]+)/.exec(sql)?.[1] ?? '')
      return { code: 0, output: '' }
    }
    if (args.includes('createdb')) {
      databases.add(args[args.length - 1] as string)
      return { code: 0, output: '' }
    }
    return { code: 0, output: '' }
  }
  return { databases, roles }
}

