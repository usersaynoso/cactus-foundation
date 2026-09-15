import type { SearchDocument, SearchSourceKey } from '../types'

export type AdapterOptions = { excerptLength: number }

// One public content type. Adapters read other modules' tables with raw SQL
// through the shared prisma client - never by importing from those modules
// (a static cross-module import breaks every build without that module).
// Each adapter re-implements the source module's public-visibility predicate;
// the comment above each query names where the source of truth lives so drift
// is caught in review when that module changes.
export type SearchAdapter = {
  source: SearchSourceKey
  label: string
  // `installed` is the set of installed module names (lib/modules/live-status).
  isAvailable(installed: Set<string>): boolean | Promise<boolean>
  // All currently-public entity ids (drives the deletion diff).
  listIds(): Promise<string[]>
  // Ids whose source row changed since the given time (null = everything).
  listChangedSince(since: Date | null): Promise<string[]>
  // Fully-built documents for a batch of ids. Ids that are no longer public
  // simply do not appear in the result (the deletion diff cleans them up).
  fetchDocuments(ids: string[], opts: AdapterOptions): Promise<SearchDocument[]>
}
