import { createHash } from 'crypto'

// ---------------------------------------------------------------------------
// Storage-key basenames.
//
// Keys come in two forms and they carry uniqueness differently:
//
//   nanoid form  "<nanoid>-<label>.<ext>"  - the nanoid is the unique part, so
//                                            the label is decoration and can be
//                                            clipped as short as we like.
//   exact form   "<name>.<ext>"            - no nanoid. The CALLER promises the
//                                            name is unique within the folder
//                                            (the shop names product images
//                                            "<product-slug><n>"), and the key
//                                            is meant to read back exactly as
//                                            named.
//
// Those forms need different clipping rules. Sharing one 40-character cap
// between them was silent data loss: "<product-slug><n>" was cut down to a
// 40-char stub, so a long-named product's images - and every variant image filed
// beside them - collapsed onto ONE key. Storage overwrote blob with blob while
// each Media row kept its own id and url, which surfaced as previews that didn't
// match the image served, and images quietly replacing one another.
//
// So the exact form is only clipped when the name would make an unreasonable
// key, and uniqueness survives even then: a hash of the full name is pinned on
// the end. The hash is deterministic, so re-filing an already-filed image
// resolves to the same key and stays a no-op.
// ---------------------------------------------------------------------------

/** Longest exact basename kept verbatim; past this a hash suffix takes over. */
export const MAX_EXACT_BASENAME = 120

const HASH_LENGTH = 10

/** Lower-case, url-safe form of `name`. No length cap - callers decide that. */
function sanitize(name: string): string {
  return name
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

/** Drop a trailing filename extension: "logo.png" -> "logo". */
export function stripExtension(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, '')
}

/**
 * Basename for an exact-name key. The caller's name is kept whole unless it is
 * longer than MAX_EXACT_BASENAME, in which case a readable prefix plus a hash of
 * the full name stands in - so names that differ always produce keys that
 * differ. Empty when there is no usable name; callers fall back to the nanoid
 * form.
 */
export function exactBaseName(originalFilename?: string): string {
  const safe = sanitize(stripExtension(originalFilename ?? ''))
  if (safe.length <= MAX_EXACT_BASENAME) return safe

  const digest = createHash('sha256').update(safe).digest('hex').slice(0, HASH_LENGTH)
  const prefix = safe.slice(0, MAX_EXACT_BASENAME - HASH_LENGTH - 1).replace(/-+$/, '')
  return `${prefix}-${digest}`
}

/** The decorative label on a nanoid-form key, e.g. "-logo". Clipped short. */
export function nanoidLabel(originalFilename?: string): string {
  if (!originalFilename) return ''
  const safe = sanitize(stripExtension(originalFilename)).slice(0, 40)
  return safe ? `-${safe}` : ''
}
