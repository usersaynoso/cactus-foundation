import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { parseTarball } from './tarball'
import { deployVercelFiles } from './upload-deploy'

// A Vercel project with no Git link only builds what it is handed. Cactus hands it
// the files of the commit it just pushed, read out of GitHub's tarball. A dropped,
// renamed or mangled file is a broken build of the right commit - so the reader is
// tested against a real `tar` archive, long paths and all.

// Built with `git archive`, which is what GitHub serves for a tarball download: a pax
// global header carrying the commit, one top-level directory, pax headers for long paths.
function makeTarball(): { gz: Buffer; longPath: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'cactus-tar-'))
  const longDir = 'a'.repeat(60) + '/' + 'b'.repeat(60)
  const longPath = `${longDir}/${'c'.repeat(40)}.ts`
  mkdirSync(join(root, longDir), { recursive: true })
  mkdirSync(join(root, 'scripts'))
  writeFileSync(join(root, 'package.json'), '{"name":"site"}\n')
  writeFileSync(join(root, longPath), 'export const x = 1\n')
  writeFileSync(join(root, 'scripts/run.sh'), '#!/bin/sh\necho hi\n')
  chmodSync(join(root, 'scripts/run.sh'), 0o755)
  symlinkSync('package.json', join(root, 'link.json'))
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: root })
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'x')
  const gz = git('archive', '--format=tar.gz', '--prefix=owner-repo-abc123/', 'HEAD')
  return { gz, longPath, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

describe('parseTarball', () => {
  it('reads every file relative to the repo root, with modes and long paths', () => {
    const { gz, longPath, cleanup } = makeTarball()
    try {
      const files = parseTarball(gz)
      const byPath = new Map(files.map((f) => [f.path, f]))
      expect([...byPath.keys()].sort()).toEqual(['link.json', longPath, 'package.json', 'scripts/run.sh'].sort())
      expect(byPath.get('package.json')?.data.toString()).toBe('{"name":"site"}\n')
      // git archive writes 0664/0775 (tar.umask 002); the executable bit is what matters.
      expect((byPath.get('package.json')?.mode ?? 0) & 0o170111).toBe(0o100000)
      expect((byPath.get('scripts/run.sh')?.mode ?? 0) & 0o170111).toBe(0o100111)
      expect(byPath.get(longPath)?.data.toString()).toBe('export const x = 1\n')
      expect(byPath.get('link.json')?.data.toString()).toBe('package.json')
      expect((byPath.get('link.json')?.mode ?? 0) & 0o170000).toBe(0o120000)
    } finally {
      cleanup()
    }
  })

  it('throws on a truncated archive rather than deploying half a site', async () => {
    const { gzipSync, gunzipSync } = await import('node:zlib')
    const { gz, cleanup } = makeTarball()
    try {
      const raw = gunzipSync(gz)
      expect(() => parseTarball(gzipSync(raw.subarray(0, 700)))).toThrow()
    } finally {
      cleanup()
    }
  })
})

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')

describe('deployVercelFiles', () => {
  type Call = { url: string; method: string; body?: string; headers?: Record<string, string> }
  let calls: Call[]

  function stub(missingOnFirstCreate: string[] | null | 'none') {
    calls = []
    let creates = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined, headers: init?.headers as Record<string, string> })
        if (url.includes('/v9/projects/')) return Response.json({ accountId: 'team_x', name: 'tillerwell' })
        if (url.includes('/v2/files')) return Response.json({})
        if (url.includes('/v13/deployments') && method === 'POST') {
          creates++
          if (creates === 1 && missingOnFirstCreate !== 'none') {
            return Response.json(
              { error: { code: 'missing_files', ...(missingOnFirstCreate ? { missing: missingOnFirstCreate } : {}) } },
              { status: 400 }
            )
          }
          return Response.json({ id: 'dpl_up' })
        }
        return new Response('unexpected', { status: 404 })
      })
    )
  }

  beforeEach(() => vi.unstubAllGlobals())
  afterEach(() => vi.unstubAllGlobals())

  const files = [
    { path: 'a.txt', data: Buffer.from('A'), mode: 0o100644 },
    { path: 'b.txt', data: Buffer.from('B'), mode: 0o100644 },
  ]

  it('uploads only the files Vercel says it lacks, then creates a production deployment', async () => {
    stub([sha1('B')])
    const result = await deployVercelFiles('t', 'prj', files, { commitSha: 'abc', commitRef: 'main' })

    expect(result).toEqual({ triggered: true, deploymentId: 'dpl_up' })
    const uploads = calls.filter((c) => c.url.includes('/v2/files'))
    expect(uploads).toHaveLength(1)
    expect(uploads[0]?.headers?.['x-vercel-digest']).toBe(sha1('B'))
    expect(uploads[0]?.url).toContain('teamId=team_x')

    const create = calls.filter((c) => c.url.includes('/v13/deployments')).at(-1)
    const body = JSON.parse(create?.body ?? '{}') as Record<string, unknown>
    expect(body).toMatchObject({ name: 'tillerwell', project: 'prj', target: 'production' })
    expect(body.files).toEqual([
      { file: 'a.txt', sha: sha1('A'), size: 1, mode: 0o100644 },
      { file: 'b.txt', sha: sha1('B'), size: 1, mode: 0o100644 },
    ])
    expect(body.gitMetadata).toMatchObject({ commitSha: 'abc', commitRef: 'main' })
  })

  it('uploads nothing when Vercel already has every file', async () => {
    stub('none')
    const result = await deployVercelFiles('t', 'prj', files)
    expect(result.triggered).toBe(true)
    expect(calls.some((c) => c.url.includes('/v2/files'))).toBe(false)
  })

  it('uploads everything when Vercel does not list what is missing', async () => {
    stub(null)
    await deployVercelFiles('t', 'prj', files)
    expect(calls.filter((c) => c.url.includes('/v2/files'))).toHaveLength(2)
  })

  it('reports an API refusal instead of claiming a deployment', async () => {
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.includes('/v9/projects/')) return Response.json({ accountId: 'user_1', name: 'site' })
        return new Response('{"error":{"code":"forbidden"}}', { status: 403 })
      })
    )
    const result = await deployVercelFiles('t', 'prj', files)
    expect(result.triggered).toBe(false)
    expect(result.error).toContain('403')
  })
})
