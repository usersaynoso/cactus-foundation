import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEnv } from './env-file.ts'
import { Host } from './host.ts'
import { addSite, nextPorts } from './provision.ts'
import { fakeSystem, testConfig } from './testing.ts'
import { tokenMatches } from './tokens.ts'

function newHost() {
  const system = fakeSystem()
  system.run = async (cmd, args) => {
    system.calls.push({ cmd, args })
    if (cmd === 'ssh-keygen') {
      const file = args[args.indexOf('-f') + 1] as string
      writeFileSync(file, 'private')
      writeFileSync(`${file}.pub`, 'ssh-ed25519 AAAA cactus-host shop')
    }
    return { code: 0, output: '' }
  }
  return { host: new Host(testConfig(), system, { log: () => {} }), system }
}

describe('nextPorts', () => {
  it('takes the lowest free pair', () => {
    expect(nextPorts([], 3100)).toEqual({ a: 3100, b: 3101 })
    expect(nextPorts([3100, 3101, 3104, 3105], 3100)).toEqual({ a: 3102, b: 3103 })
  })
})

describe('addSite', () => {
  it('sets up everything the first build needs', async () => {
    const { host, system } = newHost()
    const { site, deployKeyPublic } = await addSite(host, { id: 'shop', repo: 'example/shop-site', domains: ['Shop.Example.com'] })

    expect(site).toMatchObject({ user: 'cactus-shop', branch: 'main', ports: { a: 3100, b: 3101 }, domains: ['shop.example.com'] })
    expect(deployKeyPublic).toMatch(/^ssh-ed25519 /)
    const paths = host.store.paths('shop')
    const env = parseEnv(readFileSync(paths.env, 'utf8'))
    expect(env.get('CACTUS_HOSTING_PROVIDER')).toBe('server')
    expect(env.get('CACTUS_HOST_SITE_ID')).toBe('shop')
    expect(env.get('GITHUB_REPO')).toBe('example/shop-site')
    expect(tokenMatches(env.get('CACTUS_HOST_TOKEN') ?? '', site.tokenHash)).toBe(true)
    expect(host.listEnvKeys('shop').find((k) => k.key === 'CACTUS_HOST_TOKEN')?.secret).toBe(true)
    expect(readFileSync(paths.unitFile('b'), 'utf8')).toContain('-p 3101')
    expect(readFileSync(paths.caddyFile, 'utf8')).toContain('still being built')
    expect(system.calls.map((c) => c.cmd)).toEqual(['ssh-keygen', 'systemctl', 'systemctl'])
  })

  it('gives the next site the next ports, and refuses duplicates', async () => {
    const { host } = newHost()
    await addSite(host, { id: 'shop', repo: 'example/shop-site', domains: ['shop.example.com'] })
    const { site } = await addSite(host, { id: 'blog', repo: 'example/blog-site' })
    expect(site.ports).toEqual({ a: 3102, b: 3103 })
    await expect(addSite(host, { id: 'shop', repo: 'example/x' })).rejects.toThrow(/already a site/)
    await expect(addSite(host, { id: 'other', repo: 'example/x', domains: ['shop.example.com'] })).rejects.toThrow(/another site/)
    await expect(addSite(host, { id: 'Bad_Name', repo: 'example/x' })).rejects.toThrow(/site name/)
    await expect(addSite(host, { id: 'fine', repo: 'not a repo' })).rejects.toThrow(/owner\/repo/)
  })
})
