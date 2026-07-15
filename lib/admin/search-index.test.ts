import { readFileSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { ADMIN_SEARCH_ENTRIES } from './search-index'

// Static, network-free proof that the command-palette search index is internally
// consistent AND that every deep link it hands out actually lands somewhere:
//   - each #hash must correspond to a real anchor id the target page renders, or
//     the "jump straight to this setting" lands uselessly at the top of the page.
// This is the one invariant tsc/eslint can't see: the index and the page markup
// live in different files and drift silently.

const REPO_ROOT = path.resolve(__dirname, '..', '..')

// Which source file renders the anchors for a given entry path (before the ? / #).
function pageSourceFor(entryPath: string): string | null {
  const base = entryPath.split(/[?#]/)[0] ?? entryPath
  if (base === '/config') return 'app/cactus-admin/config/ConfigPageClient.tsx'
  return null // only the config page uses #hash section anchors today
}

function readSource(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf8')
}

describe('admin search index shape', () => {
  it('has unique entry ids', () => {
    const ids = ADMIN_SEARCH_ENTRIES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every path is admin-relative (starts with /)', () => {
    for (const e of ADMIN_SEARCH_ENTRIES) {
      expect(e.path.startsWith('/'), `${e.id}: ${e.path}`).toBe(true)
    }
  })

  it('every requires is a known top-level admin base path', () => {
    const KNOWN = new Set(['', '/pages', '/menus', '/media', '/config', '/appearance', '/layouts', '/modules', '/users'])
    for (const e of ADMIN_SEARCH_ENTRIES) {
      if (e.requires !== undefined) {
        expect(KNOWN.has(e.requires), `${e.id}: requires ${e.requires}`).toBe(true)
      }
    }
  })
})

describe('admin search index deep-link anchors resolve', () => {
  it('every #hash matches an anchor rendered on its target page', () => {
    const missing: string[] = []

    for (const entry of ADMIN_SEARCH_ENTRIES) {
      const hashIndex = entry.path.indexOf('#')
      if (hashIndex === -1) continue
      const hash = entry.path.slice(hashIndex + 1)

      const sourceRel = pageSourceFor(entry.path)
      if (!sourceRel) {
        missing.push(`${entry.id}: no known source file for ${entry.path}`)
        continue
      }
      const src = readSource(sourceRel)

      // Literal anchors: id="general-backup", id="email-test", …
      if (src.includes(`id="${hash}"`)) continue

      // Dynamic env-section anchors: rendered as id={`section-${section.id}`}. Accept
      // a section-<x> hash when that template exists AND the section id <x> is defined.
      if (hash.startsWith('section-')) {
        const sectionId = hash.slice('section-'.length)
        if (src.includes('id={`section-${section.id}`}') && src.includes(`id: '${sectionId}'`)) continue
      }

      missing.push(`${entry.id}: #${hash} has no matching anchor in ${sourceRel}`)
    }

    expect(missing, `Unresolved deep-link anchors:\n${missing.join('\n')}`).toEqual([])
  })
})
