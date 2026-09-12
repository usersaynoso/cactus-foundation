// The SERVER map, not the complete one. Both carry this point; the complete one
// also carries every module's admin screens, and this file is reachable from a
// public page - so importing it there put 160 admin components into the homepage's
// bundle. See lib/modules/extension-points.server.ts.
import { moduleServerExtensionPointComponents as moduleExtensionPointComponents } from '@/lib/modules/extension-points.server'

// Contract for the "core.agent-content" extension point.
//
// Three fixed addresses that language models and the agents built on them look
// for, none of which can live under /api/m/<module>/… where a module's own
// routes live:
//
//   /llms.txt        an index of the site, in Markdown, for a model with a
//                    small context window to choose from
//   /llms-full.txt   the same index with the shorter documents inlined
//   /<any-path>.md   the Markdown twin of the page at /<any-path>
//
// Core owns the three addresses and knows nothing about what belongs at them:
// no content types, no tables, no Markdown. A module registers one provider,
// keyed by its module id, and answers. Nothing registered means the addresses
// 404, which is exactly what the site did before this existed.
//
// Deliberately read from the FULL extension-point map rather than the public
// one: a provider here reads the whole catalogue out of the database, so it is
// registered serverOnly and withheld from the public map on purpose. These are
// route handlers, not pages - nothing they import reaches a page's bundle.

export type AgentMarkdownDocument = {
  /** The document body. Markdown, no front matter - the route adds no wrapper. */
  markdown: string
  /** When the underlying content last changed, for Last-Modified. */
  lastModified?: Date | null
}

export type AgentContentProvider = {
  /** The /llms.txt index. Null when the owner has the feature switched off. */
  llmsIndex?: (siteUrl: string) => Promise<string | null>
  /** The /llms-full.txt corpus. Null when off, or when the site is too big for one. */
  llmsFull?: (siteUrl: string) => Promise<string | null>
  /**
   * The Markdown twin of a page. `path` is the address with the .md suffix
   * already stripped and no leading slash - 'about', 'shop/products/foo'. The
   * empty string is the homepage. Null when there is no such page.
   */
  markdown?: (path: string, siteUrl: string) => Promise<AgentMarkdownDocument | null>
}

function providers(): AgentContentProvider[] {
  const map = moduleExtensionPointComponents['core.agent-content'] as
    | Record<string, AgentContentProvider>
    | undefined
  return map ? Object.values(map) : []
}

// A provider that throws is skipped rather than allowed to take the request
// down with it. A crawler reading a 500 here concludes the site is broken;
// reading a 404 it concludes there is nothing to fetch, which is the truth.
async function first<T>(
  pick: (provider: AgentContentProvider) => (() => Promise<T | null>) | null,
): Promise<T | null> {
  for (const provider of providers()) {
    const fn = pick(provider)
    if (!fn) continue
    try {
      const result = await fn()
      if (result !== null && result !== undefined) return result
    } catch (err) {
      console.error('[agent-content] provider failed', err)
    }
  }
  return null
}

export function hasAgentContentProvider(): boolean {
  return providers().length > 0
}

export async function readLlmsIndex(siteUrl: string): Promise<string | null> {
  return first((p) => (p.llmsIndex ? () => p.llmsIndex!(siteUrl) : null))
}

export async function readLlmsFull(siteUrl: string): Promise<string | null> {
  return first((p) => (p.llmsFull ? () => p.llmsFull!(siteUrl) : null))
}

export async function readAgentMarkdown(
  path: string,
  siteUrl: string,
): Promise<AgentMarkdownDocument | null> {
  return first((p) => (p.markdown ? () => p.markdown!(path, siteUrl) : null))
}
