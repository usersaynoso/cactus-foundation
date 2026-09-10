// The one failure shape both ends of `core.reply-suggestions` need, in a file
// of its own.
//
// A suggester throws it; the module route that asked turns it into a status and
// a sentence somebody can act on. It cannot live beside the types it belongs
// with (lib/conversations/types.ts) because a class is runtime code and that
// file is imported for its types from both halves of the app - and it cannot
// live in the resolver, because a module publishing a suggester would then
// import the resolver, which imports the generated registry, which imports that
// module. Nothing at all is imported here, so neither problem arises.

export class ReplySuggestionError extends Error {
  /** What the route should answer with. 429 is the one worth trying again. */
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'ReplySuggestionError'
    this.status = status
  }
}

/** True for anything a suggester threw on purpose, from either side of a module
 *  boundary. `instanceof` alone is not enough: the same class can be evaluated
 *  twice in one process when the bundler puts it in two chunks, and a draft
 *  refused with a perfectly good explanation would come back as "something went
 *  wrong" for no better reason than which chunk it was thrown from. */
export function isReplySuggestionError(value: unknown): value is ReplySuggestionError {
  if (value instanceof ReplySuggestionError) return true
  if (!(value instanceof Error)) return false
  return value.name === 'ReplySuggestionError' && typeof (value as ReplySuggestionError).status === 'number'
}
