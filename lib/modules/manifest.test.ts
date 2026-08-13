import { describe, it, expect } from 'vitest'
import { parseGitHubRepo } from './manifest'

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
