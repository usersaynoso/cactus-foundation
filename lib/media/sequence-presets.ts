import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getSequenceFlyTokenEnv, getSequenceWorkerUrl } from '@/lib/config/env'

// Scroll-sequence conversion settings, stored as a single JSON column on the
// SiteConfig singleton (same pattern as membersConfig / adminMenuConfig). A null
// or partial column parses to the defaults below, so fresh installs need no row
// changes and new keys can be added without a migration.
//
// There used to be two presets ('fast' and 'quality'); there is now ONE set of
// conversion settings, defaulting to the old high-quality values (30 fps, up to
// 1920px wide). The admin tunes them under Media > Scroll sequences; the enqueue
// route only ever reads the stored values, so what an admin sets is exactly what
// runs - the browser never gets to pick engine/fps/width. A legacy stored
// {fast, quality} column simply fails the new parse and falls back to these
// defaults, which are the very values the old 'quality' preset shipped with.

// Only 'isnet' is offered. The sharper 'birefnet' model needs 3 GB+ of RAM even
// on a small frame and 10-30 minutes per clip on CPU. isnet mattes a product on
// a white sweep cleanly (with the worker's automatic alpha-matting retry when a
// frame comes back suspiciously empty or full), so it stays the only engine.
export const SEQUENCE_ENGINES = ['isnet'] as const
export type SequenceEngine = (typeof SEQUENCE_ENGINES)[number]

// The conversion knobs the sequence worker actually reads. The ranges mirror the
// server-side clamps in the enqueue route and the worker's own guards, so a value
// that parses here is a value the worker will accept.
const SettingsSchema = z.object({
  engine: z.enum(SEQUENCE_ENGINES).default('isnet'),
  fps: z.number().int().min(1).max(60).default(30),
  maxWidth: z.number().int().min(320).max(3840).default(1920),
})
export type SequenceSettings = z.infer<typeof SettingsSchema>

// Fly.io machine settings. When a token is present (saved here, or via the
// SEQUENCE_FLY_TOKEN env var as a fallback), each conversion gets its own
// short-lived Fly machine - several videos convert in parallel and every machine
// is destroyed the moment its job finishes. Without a token, conversions post to
// the single worker at SEQUENCE_WORKER_URL exactly as before.
const FlySchema = z.object({
  // Fly.io API token (org or app-scoped deploy token). Null = fall back to env.
  token: z.string().min(1).nullable().default(null),
  // Fly app name. Null = derived from SEQUENCE_WORKER_URL (<app>.fly.dev).
  appName: z.string().regex(/^[a-z0-9-]+$/).nullable().default(null),
})
export type SequenceFlySettings = z.infer<typeof FlySchema>

export const SequenceConfigSchema = z.object({
  settings: SettingsSchema.default({}),
  fly: FlySchema.default({}),
})
export type SequenceConfig = z.infer<typeof SequenceConfigSchema>

export const SEQUENCE_CONFIG_DEFAULTS: SequenceConfig = SequenceConfigSchema.parse({})

// A corrupted (or legacy two-preset) column must never take a conversion or the
// settings page down: fall back to defaults.
export function parseSequenceConfig(raw: unknown): SequenceConfig {
  const result = SequenceConfigSchema.safeParse(raw ?? {})
  return result.success ? result.data : SEQUENCE_CONFIG_DEFAULTS
}

export async function getSequenceConfig(): Promise<SequenceConfig> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { sequenceConfig: true },
  })
  return parseSequenceConfig(config?.sequenceConfig)
}

// ---------------------------------------------------------------------------
// Fly resolution (server-only - the token is a secret and never reaches a
// response body; routes report only WHERE a token came from)
// ---------------------------------------------------------------------------

export type ResolvedFly = { token: string; appName: string }
export type FlyTokenSource = 'saved' | 'env' | null

export function flyAppNameFromWorkerUrl(): string | null {
  const url = getSequenceWorkerUrl()
  if (!url) return null
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  const m = host.match(/^([a-z0-9-]+)\.fly\.dev$/)
  return m?.[1] ?? null
}

export function resolveFlyFromConfig(config: SequenceConfig): {
  fly: ResolvedFly | null
  source: FlyTokenSource
} {
  const token = config.fly.token ?? getSequenceFlyTokenEnv()
  const source: FlyTokenSource = config.fly.token ? 'saved' : getSequenceFlyTokenEnv() ? 'env' : null
  const appName = config.fly.appName ?? flyAppNameFromWorkerUrl()
  if (!token || !appName) return { fly: null, source }
  return { fly: { token, appName }, source }
}

export async function resolveSequenceFly(): Promise<ResolvedFly | null> {
  const config = await getSequenceConfig()
  return resolveFlyFromConfig(config).fly
}
