import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Client } from 'pg'
import {
  connectionUri,
  createTestDatabase,
  createTestRole,
  dropStaleTestObjects,
  dropTestDatabase,
  dropTestRole,
  testServerFromEnv,
  type TestRole,
  type TestServer,
} from '@/lib/backup/test-database'

// Switching between serving through the Worker and straight from the bucket,
// against a real Postgres (lib/media/serving-mode.ts).
//
// Moving the stored addresses across is raw SQL that tsc, eslint and the build
// never execute, and the guarantees that matter are about data: an install that
// never switches is not touched at all, and Worker -> direct -> Worker puts every
// url back exactly as it was.
//
// Gated like the other live suites: it needs the OVH server, makes cactus_rt_*
// databases and drops them afterwards.
const ENABLED = process.env.RUN_LEDGER_GUARDS === '1' || process.env.RUN_BACKUP_ROUNDTRIP === '1'
if (ENABLED) {
  try {
    ;(process as unknown as { loadEnvFile: (path: string) => void }).loadEnvFile('.env')
  } catch {
    // No .env - testServerFromEnv below fails the suite loudly rather than here.
  }
}
const suite = ENABLED ? describe : describe.skip

// Stands in for every module's core.media-reference-rewriters entry: the real
// ones write to module tables this core-only database does not have. What is
// being proved is that each moved row reaches them with the right pair.
const rewriterCalls: Array<{ oldUrl: string; newUrl: string; oldKey: string; newKey: string }> = []
vi.mock('@/lib/media/reference-rewriters', () => ({
  getMediaReferenceRewriters: () => [async (change: (typeof rewriterCalls)[number]) => { rewriterCalls.push(change) }],
}))

const WORKER = 'https://media.example.com'
const SITE = 'https://shop.example'

// One row per shape an existing install can hold.
const ROWS = [
  { id: 'b2-legacy', provider: 'B2', key: 'media/AbCdEfGhIjKlMnOpQrStU-desk.jpg', url: `${WORKER}/media/AbCdEfGhIjKlMnOpQrStU-desk.jpg` },
  { id: 'b2-folder', provider: 'B2', key: 'media/Shop/Chairs/ada.glb', url: `${WORKER}/media/Shop/Chairs/ada.glb` },
  { id: 'r2', provider: 'R2', key: 'media/R2/x_y-z.png', url: `${WORKER}/media/R2/x_y-z.png` },
  { id: 'blob', provider: 'VERCEL_BLOB', key: 'media/VERCEL_BLOB/b.jpg', url: `${WORKER}/media/VERCEL_BLOB/b.jpg` },
  { id: 'cloudinary', provider: 'CLOUDINARY', key: 'cactus/c1', url: 'https://res.cloudinary.com/demo/image/upload/v1/cactus/c1.jpg' },
  // A row still on an address from before the current Worker - left alone by a
  // Worker-mode install, because nobody asked for anything to move.
  { id: 'b2-old-host', provider: 'B2', key: 'media/old.jpg', url: 'https://cactus-media.someone.workers.dev/media/old.jpg' },
] as const

suite('serving mode switches, against a real database', () => {
  let server: TestServer
  let role: TestRole
  let client: Client
  const databaseName = `cactus_rt_servemode_${process.pid}`
  const roleName = `cactus_rt_role_servemode_${process.pid}`
  let upload: typeof import('./upload')
  const envBefore = { mode: process.env.MEDIA_SERVING_MODE, site: process.env.SITE_URL, worker: process.env.CLOUDFLARE_WORKER_URL }

  async function urls(): Promise<Record<string, string>> {
    const { rows } = await client.query<{ id: string; url: string }>('SELECT id, url FROM "Media" ORDER BY id')
    return Object.fromEntries(rows.map((r) => [r.id, r.url]))
  }

  async function pageBody(): Promise<string> {
    const { rows } = await client.query<{ builderData: unknown }>('SELECT "builderData" FROM "InfoPage" WHERE id = $1', ['page'])
    return JSON.stringify(rows[0]?.builderData)
  }

  async function keysAndProviders(): Promise<string> {
    const { rows } = await client.query('SELECT id, key, provider::text FROM "Media" ORDER BY id')
    return JSON.stringify(rows)
  }

  beforeAll(async () => {
    server = testServerFromEnv()
    await dropStaleTestObjects(server)
    role = await createTestRole(server, roleName)
    await createTestDatabase(server, databaseName, role)

    const uri = connectionUri(server, databaseName, role)
    client = new Client({ connectionString: `${uri}&uselibpqcompat=true` })
    await client.connect()
    const coreInit = join(process.cwd(), 'prisma', 'migrations', '20260626000000_init', 'migration.sql')
    await client.query(readFileSync(coreInit, 'utf8'))
    for (const r of ROWS) {
      await client.query(
        `INSERT INTO "Media" (id, key, provider, url, "mimeType", "sizeBytes") VALUES ($1, $2, $3::"MediaProviderType", $4, 'image/jpeg', 1)`,
        [r.id, r.key, r.provider, r.url],
      )
    }

    // A page showing two of those pictures, one of them twice.
    const r2 = ROWS.find((r) => r.id === 'r2')!.url
    const desk = ROWS.find((r) => r.id === 'b2-legacy')!.url
    await client.query(
      `INSERT INTO "InfoPage" (id, slug, title, body, "updatedAt", "builderData") VALUES ('page', 'p', 'P', '', CURRENT_TIMESTAMP, $1::jsonb)`,
      [JSON.stringify({ content: [{ type: 'Image', props: { src: r2 } }, { type: 'Hero', props: { image: desk, alt: desk } }] })],
    )

    process.env.DATABASE_URL = uri
    process.env.SITE_URL = SITE
    process.env.CLOUDFLARE_WORKER_URL = WORKER
    delete process.env.MEDIA_SERVING_MODE
    upload = await import('./upload')
  }, 120_000)

  afterEach(() => {
    delete process.env.MEDIA_SERVING_MODE
  })

  afterAll(async () => {
    for (const [k, v] of [['MEDIA_SERVING_MODE', envBefore.mode], ['SITE_URL', envBefore.site], ['CLOUDFLARE_WORKER_URL', envBefore.worker]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    await import('@/lib/db/prisma')
      .then((module) => module.prisma.$disconnect())
      .catch(() => undefined)
    await client?.end().catch(() => undefined)
    if (server) {
      await dropTestDatabase(server, databaseName).catch(() => undefined)
      await dropTestRole(server, roleName).catch(() => undefined)
    }
  }, 120_000)

  it('leaves a Worker-mode install exactly as it is: nothing pending, nothing moved', async () => {
    const before = await urls()
    expect(await upload.countMediaUrlsOffServingMode()).toEqual({ mode: 'worker', pending: 0 })
    const page = await pageBody()
    expect(await upload.rebaseMediaUrlsToServingMode()).toEqual({ mode: 'worker', moved: 0, remaining: 0 })
    expect(await urls()).toEqual(before)
    expect(await pageBody()).toBe(page)
    expect(rewriterCalls).toEqual([])
  })

  it('round-trips Worker -> direct -> Worker, changing only the url', async () => {
    const original = await urls()
    const identity = await keysAndProviders()

    process.env.MEDIA_SERVING_MODE = 'direct'
    // Every S3-style row, old address included; never Vercel Blob or Cloudinary.
    expect(await upload.countMediaUrlsOffServingMode()).toEqual({ mode: 'direct', pending: 4 })
    const pageBefore = await pageBody()
    // A pass cut short by its deadline moves what it reached and says what is left.
    expect(await upload.rebaseMediaUrlsToServingMode({ deadline: 0 })).toEqual({ mode: 'direct', moved: 0, remaining: 4 })
    expect(await upload.rebaseMediaUrlsToServingMode({ batchSize: 3 })).toEqual({ mode: 'direct', moved: 4, remaining: 0 })
    const direct = await urls()
    // The page and every module rewriter followed each row; only the url moved.
    expect(await pageBody()).toBe(pageBefore.replaceAll(original['r2']!, direct['r2']!).replaceAll(original['b2-legacy']!, direct['b2-legacy']!))
    expect(await pageBody()).not.toContain(WORKER)
    expect(rewriterCalls).toHaveLength(4)
    for (const call of rewriterCalls) {
      expect(call.oldKey).toBe(call.newKey)
      expect(call.newUrl.startsWith(`${SITE}/api/media/`)).toBe(true)
    }
    rewriterCalls.length = 0
    expect(direct['b2-legacy']).toBe(`${SITE}/api/media/media/AbCdEfGhIjKlMnOpQrStU-desk.jpg`)
    expect(direct['b2-folder']).toBe(`${SITE}/api/media/media/Shop/Chairs/ada.glb`)
    expect(direct['r2']).toBe(`${SITE}/api/media/media/R2/x_y-z.png`)
    expect(direct['b2-old-host']).toBe(`${SITE}/api/media/media/old.jpg`)
    expect(direct['blob']).toBe(original['blob'])
    expect(direct['cloudinary']).toBe(original['cloudinary'])
    expect(await upload.countMediaUrlsOffServingMode()).toEqual({ mode: 'direct', pending: 0 })
    // Idempotent.
    expect(await upload.rebaseMediaUrlsToServingMode()).toEqual({ mode: 'direct', moved: 0, remaining: 0 })
    expect(rewriterCalls).toEqual([])

    // A Worker deploy while serving directly must not drag the direct rows back.
    expect(await upload.rebaseProxiedMediaUrls(WORKER)).toBe(0)
    expect(await urls()).toEqual(direct)

    delete process.env.MEDIA_SERVING_MODE
    expect(await upload.countMediaUrlsOffServingMode()).toEqual({ mode: 'worker', pending: 4 })
    expect(await upload.rebaseMediaUrlsToServingMode()).toEqual({ mode: 'worker', moved: 4, remaining: 0 })
    const back = await urls()
    // The page is back byte for byte, and the rewriters were told the way home.
    expect(await pageBody()).toBe(pageBefore)
    expect(rewriterCalls).toHaveLength(4)
    // Every row that was on the current Worker is back exactly as it was.
    for (const id of ['b2-legacy', 'b2-folder', 'r2', 'blob', 'cloudinary']) expect(back[id]).toBe(original[id])
    // The one that was on a retired host lands on the current Worker, the same
    // place a Worker redeploy would have put it.
    expect(back['b2-old-host']).toBe(`${WORKER}/media/old.jpg`)
    expect(await upload.countMediaUrlsOffServingMode()).toEqual({ mode: 'worker', pending: 0 })

    // Keys and providers never moved.
    expect(await keysAndProviders()).toBe(identity)
  })
})
