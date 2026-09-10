import { prisma } from '@/lib/db/prisma'
import { INSTALLED_MODULE_WHERE } from '@/lib/modules/live-status'
import { isReplySuggestionError, ReplySuggestionError } from '@/lib/conversations/reply-suggestion-error'
import {
  REPLY_SUGGESTER_POINT,
  type ReplySuggester,
  type ReplySuggestionRequest,
  type ResolvedReplySuggester,
} from '@/lib/conversations/types'

// Resolver for `core.reply-suggestions` - see lib/conversations/types.ts for
// what the seam is for and why core names neither end of it.
//
// Deliberately the same shape as lib/conversations/providers.ts: the installed
// module gate, the generated registry as the final word on what actually
// exists, a cheap shape check rather than trust, and a shrug when a manifest
// names an entry the bundle has not caught up with - a module installed for the
// first time is live in the database a build before its code is.
//
// SERVER ONLY. A suggester reaches an API with somebody's key on it, and the
// manifest entry that publishes one carries `serverOnly: true` so it stays out
// of lib/modules/extension-points.public.ts.

/** How many drafts a reply box asks for. Three is enough to choose between and
 *  few enough to read; every one of them is charged for by whoever answers. */
export const REPLY_SUGGESTION_COUNT = 3

/** Longest transcript any suggester is handed, in characters. A conversation
 *  forty messages deep is mostly quotations of itself, and the newest end is
 *  the half worth paying for. */
const MAX_TRANSCRIPT_CHARS = 24_000

type ExtensionPointEntry = { point: string; id: string }

/** A module could publish anything at all here, and the failure would land
 *  inside somebody's reply box. Cheap shape check, skip what fails it. */
function isSuggester(value: unknown): value is ReplySuggester {
  if (!value || typeof value !== 'object') return false
  const one = value as Partial<ReplySuggester>
  return typeof one.suggest === 'function'
    && typeof one.isConfigured === 'function'
    && typeof one.label === 'string'
}

/** Every reply suggester the installed modules publish, whether or not any of
 *  them is set up. */
export async function resolveReplySuggesters(): Promise<ResolvedReplySuggester[]> {
  // Dynamic on purpose: the registry imports the module that contributes a
  // suggester, and that module's own admin screens reach back into core, so a
  // static import risks closing a cycle. Turbopack merges a cycle into one
  // scope and can fail a production build with "Cannot access 'x' before
  // initialization", on some module sets and not others. See
  // scripts/check-import-cycles.mjs.
  const { moduleExtensionPointComponents } = await import('@/lib/modules/extension-points')
  const components = moduleExtensionPointComponents[REPLY_SUGGESTER_POINT] ?? {}
  if (Object.keys(components).length === 0) return []

  const modules = await prisma.module.findMany({
    where: { ...INSTALLED_MODULE_WHERE },
    select: { name: true, manifest: true },
    orderBy: { name: 'asc' },
  })

  const resolved: ResolvedReplySuggester[] = []
  for (const mod of modules) {
    const manifest = mod.manifest as { extensionPoints?: ExtensionPointEntry[] } | null
    for (const entry of manifest?.extensionPoints ?? []) {
      if (entry.point !== REPLY_SUGGESTER_POINT) continue
      const suggester = components[entry.id]
      if (!isSuggester(suggester)) continue
      resolved.push({ moduleName: mod.name, id: entry.id, suggester })
    }
  }
  return resolved
}

/** The one that would actually answer, or null. */
export async function firstConfiguredReplySuggester(): Promise<ResolvedReplySuggester | null> {
  for (const one of await resolveReplySuggesters()) {
    try {
      if (await one.suggester.isConfigured()) return one
    } catch (err) {
      // A suggester that cannot even say whether it is set up is not one to
      // hand a customer's conversation to. Its module's problem, not the reply
      // box's.
      console.error(`[core] reply suggester from ${one.moduleName} could not say whether it is configured:`, err)
    }
  }
  return null
}

/**
 * Whether to draw the button at all.
 *
 * Asked while a reply box is being rendered, so it has to be cheap: on the
 * overwhelming majority of sites the generated registry is empty for this point
 * and the answer costs nothing whatever. Only a site that has actually
 * installed a suggester pays for the module query behind it.
 */
export async function canSuggestReplies(): Promise<boolean> {
  return (await firstConfiguredReplySuggester()) !== null
}

/** The newest end of a conversation, trimmed to something worth paying for.
 *  Oldest first on the way out, exactly as it went in. */
export function trimTranscript<T extends { text: string }>(messages: T[], budget = MAX_TRANSCRIPT_CHARS): T[] {
  const kept: T[] = []
  let spent = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (!message) continue
    spent += message.text.length
    // Always keep one, however long it is - a single enormous message is still
    // the whole conversation, and coming back with nothing to work from would
    // be a worse answer than coming back with a long one.
    if (spent > budget && kept.length > 0) break
    kept.push(message)
  }
  return kept.reverse()
}

/**
 * A few drafts for whoever is staring at the box, from whichever module can
 * write them.
 *
 * Throws {@link ReplySuggestionError} throughout - including for "nothing on
 * this site can do that", which is a 409 rather than a crash: a button can be
 * on screen from a page rendered before somebody took the key out of the
 * settings screen.
 */
export async function suggestReplies(
  request: Omit<ReplySuggestionRequest, 'count'> & { count?: number },
): Promise<{ suggestions: string[]; moduleName: string }> {
  const resolved = await firstConfiguredReplySuggester()
  if (!resolved) {
    throw new ReplySuggestionError('Nothing on this site is set up to write replies at the moment.', 409)
  }

  const messages = trimTranscript(request.messages)
  if (messages.length === 0) {
    throw new ReplySuggestionError('There is nothing on this conversation to work from yet.', 422)
  }

  let suggestions: unknown
  try {
    suggestions = await resolved.suggester.suggest({
      messages,
      subject: request.subject,
      authorName: request.authorName,
      count: request.count ?? REPLY_SUGGESTION_COUNT,
    })
  } catch (err) {
    if (isReplySuggestionError(err)) throw err
    console.error(`[core] reply suggester from ${resolved.moduleName} failed:`, err)
    throw new ReplySuggestionError('Could not get any suggestions just now. Try again in a moment.')
  }

  if (!Array.isArray(suggestions)) {
    throw new ReplySuggestionError('Could not get any suggestions just now. Try again in a moment.')
  }

  const usable = suggestions
    .filter((one): one is string => typeof one === 'string')
    .map((one) => one.trim())
    .filter((one) => one.length > 0)
    .slice(0, request.count ?? REPLY_SUGGESTION_COUNT)

  if (usable.length === 0) {
    throw new ReplySuggestionError('Nothing useful came back. Try again, or write it yourself this time.', 422)
  }

  return { suggestions: usable, moduleName: resolved.moduleName }
}
