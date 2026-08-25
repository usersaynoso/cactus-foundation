// Where this install's pictures are served from, as a bare origin.
//
// Every public page pulls its photography from one host that is not this one -
// the media Worker in front of the object store (media.example.com, or whatever
// the owner pointed at it). The browser cannot know that until it has parsed the
// HTML, found the first <img>, and only THEN started a DNS lookup, a TCP
// handshake and a TLS negotiation before a single byte of the first photograph
// moves. On a shop grid that is the critical path for the largest thing on the
// page.
//
// Naming the origin in the document head lets all of that happen while the HTML
// is still arriving. It costs one link tag and changes nothing about how the
// page looks.
//
// Read from the same environment the CSP's img-src allowlist reads (proxy.ts
// workerImageHost) and the same the next.config image loader reads, so an
// install that serves images from somewhere the CSP has never heard of cannot
// end up preconnecting to it either. Null when this install has no separate
// media host at all - a local checkout, or a provider serving from its own CDN
// per Media row rather than from one configured origin - in which case there is
// nothing to name and the tag is simply not emitted.

export function mediaPublicOrigin(): string | null {
  const explicit = process.env.CLOUDFLARE_WORKER_HOSTNAME?.trim()
  if (explicit) return safeOrigin(explicit)
  const url = process.env.CLOUDFLARE_WORKER_URL?.trim()
  if (!url) return null
  return safeOrigin(url)
}

function safeOrigin(value: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    // http would be a local or misconfigured install; preconnecting to it buys
    // nothing and naming it in the head of a live page would be worse than
    // saying nothing at all.
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}
