import { describe, it, expect } from 'vitest'
import { parseGitHubRepo, parseModuleManifest, readDeclaredCoreVersion } from './manifest'

// parseGitHubRepo is the gate deciding what the custom-module URL box will
// accept, and (more importantly) what the GitHub token can never be sent to.

describe('parseGitHubRepo', () => {
  it('accepts a plain https github repo URL', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('accepts a .git suffix', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('accepts a trailing slash', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' })
  })

  it('accepts dots, dashes and underscores in names', () => {
    expect(parseGitHubRepo('https://github.com/my-org.name/some_repo-2')).toEqual({
      owner: 'my-org.name',
      repo: 'some_repo-2',
    })
  })

  it('rejects http', () => {
    expect(() => parseGitHubRepo('http://github.com/owner/repo')).toThrow()
  })

  it('rejects non-GitHub hosts', () => {
    expect(() => parseGitHubRepo('https://gitlab.com/owner/repo')).toThrow()
  })

  it('rejects a host merely containing github.com', () => {
    expect(() => parseGitHubRepo('https://github.com.evil.example/owner/repo')).toThrow()
    expect(() => parseGitHubRepo('https://attacker.example/?x=github.com/a/b')).toThrow()
  })

  it('rejects extra path segments', () => {
    expect(() => parseGitHubRepo('https://github.com/owner/repo/tree/main')).toThrow()
  })

  it('rejects a bare owner with no repo', () => {
    expect(() => parseGitHubRepo('https://github.com/owner')).toThrow()
  })

  it('rejects something that is not a URL at all', () => {
    expect(() => parseGitHubRepo('owner/repo')).toThrow()
  })
})

// readDeclaredCoreVersion exists for one reason: the install and update routes
// have to ask what core version a module needs BEFORE validating the rest of
// its manifest. A module written against a newer core may legitimately use a
// manifest field this core's schema has never heard of - that is precisely
// what requiresCoreVersion is for - and parsing first answered "update Cactus
// first" with a page of validator internals about a field the owner has never
// seen. On the update path it was worse: the parse failure was swallowed, so
// the version gate was skipped entirely and the update went ahead.
//
// Nothing tsc or eslint can see, and it only shows up on a site running an
// older core than the developer's, which is every site but one.
describe('readDeclaredCoreVersion', () => {
  it('reads the version from a manifest this schema would reject', () => {
    // The real shape that caused it: cookieCategories gained an object form in
    // 0.5.1223, so a 0.5.1222 site validating first saw only a type error.
    const fromTheFuture = {
      name: 'google-tag',
      version: '0.1.0',
      tablePrefix: 'gt_',
      requiresCoreVersion: '0.5.1223',
      cookieCategories: [{ key: 'analytics', label: 'Analytics', description: 'Counts visits.' }],
    }
    expect(() => parseModuleManifest(fromTheFuture)).not.toThrow()
    // Same manifest, but with a field no schema yet has: still readable.
    const evenFurther = { ...fromTheFuture, someFieldInventedLater: { nested: true } }
    expect(readDeclaredCoreVersion(evenFurther)).toBe('0.5.1223')
  })

  it('reads it from an object that is otherwise complete nonsense', () => {
    expect(readDeclaredCoreVersion({ requiresCoreVersion: '1.2.3', name: 42 })).toBe('1.2.3')
  })

  it('answers null when the manifest does not say', () => {
    expect(readDeclaredCoreVersion({ name: 'thing' })).toBeNull()
  })

  it('answers null rather than guessing at a non-semver value', () => {
    expect(readDeclaredCoreVersion({ requiresCoreVersion: 'latest' })).toBeNull()
    expect(readDeclaredCoreVersion({ requiresCoreVersion: 5 })).toBeNull()
  })

  it('survives what a failed fetch actually hands it', () => {
    expect(readDeclaredCoreVersion(null)).toBeNull()
    expect(readDeclaredCoreVersion(undefined)).toBeNull()
    expect(readDeclaredCoreVersion('not json at all')).toBeNull()
    expect(readDeclaredCoreVersion([])).toBeNull()
  })
})
