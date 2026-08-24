import { createHash } from 'crypto'

// The sha GitHub would give a file with this content. Git blob shas are content
// addressed - sha1 over "blob <byte length>\0" and the bytes - so computing one locally
// is an exact, network-free answer to "does the repo already hold this?", which is how
// the core update decides whether a generated file needs writing at all.
export function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, 'utf8')
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}
