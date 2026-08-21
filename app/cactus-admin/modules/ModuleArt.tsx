'use client'

import { useMemo, useState } from 'react'

/**
 * Card artwork for a module. One 16:9 image per module lives in `public/module-art`,
 * named after the module's repository slug.
 *
 * A module's repository slug and its manifest name are not always spelled the same -
 * live-chat ships from `live-chat-powered-by-chatwoot`, the reply catcher from
 * `reply-catcher` - and which of the two a directory row carries depends on whether
 * the module came from the directory listing or from its own installed record. So we
 * try every spelling we have before giving up, rather than picking one and hoping.
 */
const ART_BASE = '/module-art'

export function moduleArtKeys(repoUrl: string, repoName: string): string[] {
  const fromUrl = repoUrl.replace(/\.git$/i, '').replace(/\/+$/, '').split('/').pop() ?? ''
  return [...new Set([fromUrl, repoName].map((s) => s.trim().toLowerCase()).filter(Boolean))]
}

type Props = {
  repoUrl: string
  repoName: string
  /** Shown only once every candidate filename has 404'd. */
  initial: string
}

export function ModuleArt({ repoUrl, repoName, initial }: Props) {
  const keys = useMemo(() => moduleArtKeys(repoUrl, repoName), [repoUrl, repoName])
  const [attempt, setAttempt] = useState(0)
  const src = attempt < keys.length ? `${ART_BASE}/${keys[attempt]}.webp` : null

  return (
    <div className="module-card__art" aria-hidden="true">
      {src ? (
        // The plate behind it is already the right green, so a tile that is still
        // loading (or never arrives) looks deliberate rather than broken.
        // eslint-disable-next-line @next/next/no-img-element -- fixed-size static asset already shipped at its display size; re-optimising it buys nothing and costs per image
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setAttempt((a) => a + 1)} />
      ) : (
        <span className="module-card__initial">{initial}</span>
      )}
    </div>
  )
}
