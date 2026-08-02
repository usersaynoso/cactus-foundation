import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { getMediaWorkerFlyTokenEnv, getMediaWorkerUrl } from '@/lib/config/env'

// Settings for the off-platform media worker, stored as a single JSON column on
// the SiteConfig singleton (same pattern as membersConfig / adminMenuConfig). A
// null or partial column parses to the defaults below, so fresh installs need no
// row changes and new keys can be added without a migration.
//
// There is only one thing to store: how to reach Fly.io. The encode settings a
// video optimise runs at are chosen per video in the dialog (see
// lib/media/video-quality.ts), because "how careful should this one be" depends
// on the clip in front of you rather than on the site.

// Fly.io machine settings. When a token is present (saved here, or via the
// MEDIA_WORKER_FLY_TOKEN env var as a fallback), each job gets its own
// short-lived Fly machine - several videos optimise in parallel and every
// machine is destroyed the moment its job finishes. Without a token, jobs post
// to the single worker at MEDIA_WORKER_URL and queue there one at a time.
const FlySchema = z.object({
  // Fly.io API token (org or app-scoped deploy token). Null = fall back to env.
  token: z.string().min(1).nullable().default(null),
  // Fly app name. Null = derived from MEDIA_WORKER_URL (<app>.fly.dev).
  appName: z.string().regex(/^[a-z0-9-]+$/).nullable().default(null),
})
export type MediaWorkerFlySettings = z.infer<typeof FlySchema>

export const MediaWorkerConfigSchema = z.object({
  fly: FlySchema.default({}),
})
export type MediaWorkerConfig = z.infer<typeof MediaWorkerConfigSchema>

export const MEDIA_WORKER_CONFIG_DEFAULTS: MediaWorkerConfig = MediaWorkerConfigSchema.parse({})

// A corrupted column (or one carried over from the scroll-sequence converter,
// which stored conversion knobs alongside the same `fly` key) must never take a
// job or the settings page down: fall back to defaults.
export function parseMediaWorkerConfig(raw: unknown): MediaWorkerConfig {
  const result = MediaWorkerConfigSchema.safeParse(raw ?? {})
  return result.success ? result.data : MEDIA_WORKER_CONFIG_DEFAULTS
}

export async function getMediaWorkerConfig(): Promise<MediaWorkerConfig> {
  const config = await prisma.siteConfig.findUnique({
    where: { id: 'singleton' },
    select: { mediaWorkerConfig: true },
  })
  return parseMediaWorkerConfig(config?.mediaWorkerConfig)
}

// ---------------------------------------------------------------------------
// Fly resolution (server-only - the token is a secret and never reaches a
// response body; routes report only WHERE a token came from)
// ---------------------------------------------------------------------------

export type ResolvedFly = { token: string; appName: string }
export type FlyTokenSource = 'saved' | 'env' | null

export function flyAppNameFromWorkerUrl(): string | null {
  const url = getMediaWorkerUrl()
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

export function resolveFlyFromConfig(config: MediaWorkerConfig): {
  fly: ResolvedFly | null
  source: FlyTokenSource
} {
  const token = config.fly.token ?? getMediaWorkerFlyTokenEnv()
  const source: FlyTokenSource = config.fly.token ? 'saved' : getMediaWorkerFlyTokenEnv() ? 'env' : null
  const appName = config.fly.appName ?? flyAppNameFromWorkerUrl()
  if (!token || !appName) return { fly: null, source }
  return { fly: { token, appName }, source }
}

export async function resolveMediaWorkerFly(): Promise<ResolvedFly | null> {
  const config = await getMediaWorkerConfig()
  return resolveFlyFromConfig(config).fly
}
