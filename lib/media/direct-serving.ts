// Server-side half of lib/media/serving-mode.ts: where a stored object is served
// from, as an absolute url prefix.
//
// Light on purpose (env + the worker-url leaf only), because lib/media/asset-token.ts
// signs urls on every public page and must not pull the upload toolchain in.

import type { MediaProviderType } from '@prisma/client'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { workerUrl } from '@/lib/media/worker-url'
import { DIRECT_MEDIA_PATH, servesDirect } from '@/lib/media/serving-mode'

/** `${SITE_URL}/api/media`, or '' when the site has no address yet. */
export function directMediaBase(): string {
  const site = getSiteUrlOrNull()
  return site ? `${site}${DIRECT_MEDIA_PATH}` : ''
}

/**
 * The prefix `provider`'s objects are served under right now: the Worker's origin,
 * or the site's own /api/media when the owner serves that provider directly. Empty
 * when the relevant address is not configured.
 */
export function mediaServeBase(provider: MediaProviderType): string {
  return servesDirect(provider) ? directMediaBase() : workerUrl()
}

/**
 * Every prefix a url of ours may start with, for code that has to recognise one
 * of its own urls (asset signing, say). Both, whatever the mode: a row written in
 * one mode is still served after a switch until the owner moves it across.
 */
export function ownMediaBases(): string[] {
  return [workerUrl(), directMediaBase()].filter(Boolean)
}
