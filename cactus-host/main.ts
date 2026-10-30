// cactus-host: runs Cactus sites on a server you control. See RUNBOOK.md.
//
//   cactus-host serve                          the service itself (systemd runs this)
//   cactus-host site add <site> --repo owner/repo [--branch main] [--name "Name"] [--domain example.com]...
//   cactus-host site list
//   cactus-host site refresh <site>            rewrite its systemd units and Caddy file
//   cactus-host site tls <site> <cert> <key>   use this site's own Cloudflare origin certificate
//   cactus-host build <site> [--sha <commit>]  build and switch over, following the log
//   cactus-host rollback <site> [<build>]      put an earlier release back live
//   cactus-host builds <site>                  recent builds
//   cactus-host logs <site> [<build>]          a build's log (the newest by default)
//   cactus-host env list <site>
//   cactus-host env set <site> KEY=value [--secret]
//   cactus-host env unset <site> KEY
//   cactus-host domain add <site> <domain>
//   cactus-host domain check <site> <domain>
//
// Everything but `serve`, `site add`, `site list` and `site refresh` goes through the
// running service's API with the site's own token, so the service stays the only
// thing that ever writes a site's records and its one-build-at-a-time lock holds
// whoever asks.

import { readFileSync } from 'node:fs'
import { loadConfig, type HostConfig } from './config.ts'
import { parseEnv } from './env-file.ts'
import { Host } from './host.ts'
import { createApiServer } from './http.ts'
import { addSite } from './provision.ts'
import type { BuildLogChunk, BuildSummary, DomainSummary, EnvKeySummary, StartBuildResponse } from './protocol.ts'
import { Scheduler } from './scheduler.ts'
import { writeFileAtomic } from './store.ts'
import { realSystem } from './system.ts'
import { slotUnit } from './units.ts'

const USAGE = readFileSync(new URL(import.meta.url), 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('//   cactus-host'))
  .map((l) => l.slice(5))
  .join('\n')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

function flags(args: string[], name: string): string[] {
  const out: string[] = []
  args.forEach((a, i) => {
    if (a === name && args[i + 1]) out.push(args[i + 1] as string)
  })
  return out
}

/** A client for the running service, as the named site. */
function client(config: HostConfig, host: Host, siteId: string) {
  const site = host.site(siteId)
  const token = parseEnv(readFileSync(host.store.paths(site.id).env, 'utf8')).get('CACTUS_HOST_TOKEN')
  if (!token) fail(`${siteId} has no CACTUS_HOST_TOKEN in its env file; run \`cactus-host site refresh ${siteId}\``)
  const base = `http://${config.listenHost}:${config.listenPort}/v1/sites/${site.id}`
  return async <T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      })
    } catch {
      fail('cactus-host is not running. Start it with `systemctl start cactus-host`.')
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    if (!res.ok) fail(data.error ?? `cactus-host answered ${res.status}`)
    return data
  }
}

async function followLog(call: ReturnType<typeof client>, buildId: string): Promise<BuildSummary> {
  let since = 0
  for (;;) {
    const chunk = await call<BuildLogChunk>(`/builds/${buildId}/log?since=${since}`)
    for (const line of chunk.lines) console.log(line)
    since = chunk.next
    if (chunk.done) break
    await new Promise((r) => setTimeout(r, 1_000))
  }
  return (await call<{ build: BuildSummary }>(`/builds/${buildId}`)).build
}

async function serve(config: HostConfig): Promise<void> {
  const host = new Host(config, realSystem)
  host.recoverInterruptedBuilds()
  const server = createApiServer(host)
  const scheduler = new Scheduler(host)
  server.listen(config.listenPort, config.listenHost, () => {
    console.log(`[cactus-host] listening on ${config.listenHost}:${config.listenPort} for ${host.store.listSites().length} site(s)`)
  })
  scheduler.start()
  const shutdown = (signal: string) => {
    console.log(`[cactus-host] ${signal}: no new work; waiting for running builds`)
    scheduler.stop()
    server.close()
    void host.waitForAll().then(() => process.exit(0))
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

async function main(argv: string[]): Promise<void> {
  const [command, sub, ...rest] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE)
    return
  }
  const config = loadConfig(process.env.CACTUS_HOST_CONFIG)
  const host = new Host(config, realSystem)

  switch (command) {
    case 'serve':
      return serve(config)

    case 'site': {
      if (sub === 'list') {
        for (const s of host.store.listSites()) {
          const live = host.summary(s)
          console.log(`${s.id}\t${s.repo}#${s.branch}\tports ${s.ports.a}/${s.ports.b}\tlive ${live.liveSha?.slice(0, 7) ?? '-'}\t${s.domains.join(' ')}`)
        }
        return
      }
      const id = rest[0] ?? fail(USAGE)
      if (sub === 'add') {
        const repo = flag(rest, '--repo') ?? fail('--repo owner/repo is required')
        const { site, deployKeyPublic } = await addSite(host, {
          id,
          repo,
          branch: flag(rest, '--branch'),
          name: flag(rest, '--name'),
          domains: flags(rest, '--domain'),
        })
        console.log(`Added ${site.id}: ${site.repo}#${site.branch}, ports ${site.ports.a} and ${site.ports.b}, user ${site.user}.`)
        console.log('')
        console.log(`Add this as a READ-ONLY deploy key on https://github.com/${site.repo}/settings/keys :`)
        console.log('')
        console.log(`  ${deployKeyPublic}`)
        console.log('')
        console.log(`Then: cactus-host build ${site.id}`)
        return
      }
      if (sub === 'tls') {
        const [cert, key] = [rest[1], rest[2]]
        if (!cert || !key) fail('Both the certificate and key paths are needed')
        const site = { ...host.site(id), tls: { cert, key } }
        await host.writeRouting(site)
        host.store.saveSite(site)
        console.log(`${site.id} now uses ${cert}. Do this while no build is running for the site.`)
        return
      }
      if (sub === 'refresh') {
        const site = host.site(id)
        const paths = host.store.paths(site.id)
        for (const slot of ['a', 'b'] as const) writeFileAtomic(paths.unitFile(slot), slotUnit(config, site, paths, slot), 0o644)
        await realSystem.run('systemctl', ['daemon-reload'])
        await host.writeRouting(site)
        console.log(`Rewrote ${paths.unit('a')}, ${paths.unit('b')} and ${paths.caddyFile}. Running slots pick the units up on their next restart.`)
        return
      }
      return fail(USAGE)
    }

    case 'build': {
      const call = client(config, host, sub ?? fail(USAGE))
      const sha = flag(rest, '--sha')
      const started = await call<StartBuildResponse>('/builds', { method: 'POST', body: { trigger: 'cli', ...(sha ? { sha } : {}) } })
      if (started.alreadyRunning) console.log(`A build is already running (${started.build.id}); following it.`)
      const done = await followLog(call, started.build.id)
      if (done.state !== 'ready') fail(done.error ?? `The build ended ${done.state}`)
      return
    }

    case 'rollback': {
      const call = client(config, host, sub ?? fail(USAGE))
      const { build } = await call<{ build: BuildSummary }>('/rollback', { method: 'POST', body: rest[0] ? { buildId: rest[0] } : {} })
      console.log(`Live: ${build.id} (${build.sha.slice(0, 7)})`)
      return
    }

    case 'builds': {
      const call = client(config, host, sub ?? fail(USAGE))
      const { builds } = await call<{ builds: BuildSummary[] }>('/builds?limit=20')
      for (const b of builds) {
        console.log(`${b.live ? '*' : ' '} ${b.id}\t${b.sha.slice(0, 7) || '-------'}\t${b.state}\t${b.error ?? ''}`)
      }
      return
    }

    case 'logs': {
      const call = client(config, host, sub ?? fail(USAGE))
      const buildId = rest[0] ?? (await call<{ builds: BuildSummary[] }>('/builds?limit=1')).builds[0]?.id
      if (!buildId) fail('No builds yet')
      await followLog(call, buildId)
      return
    }

    case 'env': {
      const call = client(config, host, rest[0] ?? fail(USAGE))
      if (sub === 'list') {
        const { keys } = await call<{ keys: EnvKeySummary[] }>('/env')
        for (const k of keys) console.log(`${k.key}${k.secret ? '\t(secret)' : ''}`)
        return
      }
      if (sub === 'set') {
        const pair = rest[1] ?? fail('KEY=value is required')
        const eq = pair.indexOf('=')
        if (eq < 1) fail('KEY=value is required')
        await call('/env', {
          method: 'PUT',
          body: { vars: [{ key: pair.slice(0, eq), value: pair.slice(eq + 1), secret: rest.includes('--secret') }] },
        })
        console.log(`Saved. It reaches the site with the next build: cactus-host build ${rest[0]}`)
        return
      }
      if (sub === 'unset') {
        const result = await call<{ deleted: string[]; failed: Array<{ key: string; error: string }> }>('/env', {
          method: 'DELETE',
          body: { keys: [rest[1] ?? fail('KEY is required')] },
        })
        for (const f of result.failed) console.error(`${f.key}: ${f.error}`)
        console.log(result.deleted.length ? 'Removed. It leaves the site with the next build.' : 'Nothing removed.')
        return
      }
      return fail(USAGE)
    }

    case 'domain': {
      const call = client(config, host, rest[0] ?? fail(USAGE))
      const name = rest[1] ?? fail('A domain is required')
      const { domain } =
        sub === 'add'
          ? await call<{ domain: DomainSummary }>('/domains', { method: 'POST', body: { name } })
          : await call<{ domain: DomainSummary }>(`/domains/${encodeURIComponent(name)}`)
      console.log(domain.serving ? `${domain.name} reaches this site.` : `${domain.name} does not reach this site yet (check its DNS and the Cloudflare proxy).`)
      return
    }

    default:
      return fail(USAGE)
  }
}

main(process.argv.slice(2)).catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)))
