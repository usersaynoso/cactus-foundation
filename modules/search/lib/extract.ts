// Extracts plain, indexable text from a Puck builder Data JSON blob without
// coupling to any specific block palette (block types vary by install). A
// standalone copy of ultimate-seo's extractor approach, trimmed to search's
// needs: one text stream, alt text folded in, everything else ignored.
// Deliberately NOT imported from ultimate-seo - that module may not be
// installed, and a cross-module import would break the build without it.

type PuckItem = { type?: string; props?: Record<string, unknown> }

const HTML_TAG_RE = /<[^>]+>/g

function stripHtml(html: string): string {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(HTML_TAG_RE, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
}

function collectItems(data: unknown): PuckItem[] {
  if (!data || typeof data !== 'object') return []
  const d = data as { content?: unknown; zones?: Record<string, unknown> }
  const items: PuckItem[] = []
  if (Array.isArray(d.content)) items.push(...(d.content as PuckItem[]))
  if (d.zones && typeof d.zones === 'object') {
    for (const zone of Object.values(d.zones)) {
      if (Array.isArray(zone)) items.push(...(zone as PuckItem[]))
    }
  }
  return items
}

// Keys whose string values are plainly not copy (ids, colours, URLs, styling).
const SKIP_KEY_RE = /(id|url|href|src|color|colour|class|icon|slug|padding|margin|width|height|align|variant|mode|target|style)$/i

function looksLikeCopy(value: string): boolean {
  if (!value.trim()) return false
  if (value.length < 3) return false
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return false
  if (/^[a-z0-9-]{16,}$/i.test(value) && !value.includes(' ')) return false
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return false
  if (/^var\(--/.test(value)) return false
  return true
}

export function extractPuckText(data: unknown): string {
  const parts: string[] = []

  const visitProps = (props: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        const k = key.toLowerCase()
        // Image alt text is searchable copy for our purposes.
        if (k === 'alt' || k === 'alttext') {
          if (value.trim()) parts.push(value.trim())
          continue
        }
        if (SKIP_KEY_RE.test(key)) continue
        if (/<[a-z][\s\S]*>/i.test(value)) {
          parts.push(stripHtml(value))
        } else if (looksLikeCopy(value)) {
          parts.push(value)
        }
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry && typeof entry === 'object') visitProps(entry as Record<string, unknown>)
        }
      } else if (value && typeof value === 'object') {
        visitProps(value as Record<string, unknown>)
      }
    }
  }

  for (const item of collectItems(data)) {
    if (item?.props && typeof item.props === 'object') visitProps(item.props)
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// Builds a card excerpt from already-plain text.
export function makeExcerpt(text: string | null | undefined, maxLength: number): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength)}…`
}
