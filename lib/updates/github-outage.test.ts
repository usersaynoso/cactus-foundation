import { describe, it, expect } from 'vitest'
import { looksLikeGitHubProblem } from './github-outage'
import { writeAccessProblem, type WriteAccessProbe } from '@/lib/github/write-access'

// The update route shows the raw error, then the status-page hint when
// looksLikeGitHubProblem says so. Both cases below follow that path: the preflight's
// answer decides which error the owner sees, and the hint check runs on that error.
const RAW_403 =
  'Update failed: Core update push failed (0.5.1887 -> 0.5.1889: 5 writes, up to 0 deletions): ' +
  'Resource not accessible by integration - https://docs.github.com/rest/git/trees#create-a-tree'

function errorSeen(probe: WriteAccessProbe): string {
  const problem = writeAccessProblem(probe, 'acme', 'site')
  return problem ? `Update failed: ${problem}` : RAW_403
}

describe('write-permission preflight and the outage hint', () => {
  it('a read-only App gets the permissions message and no status-page hint', () => {
    const message = errorSeen({ kind: 'app', installedOnRepo: true, contents: 'read' })
    expect(message).toContain('cannot write to acme/site')
    expect(message).toContain('Contents to Read and write')
    expect(message).not.toMatch(/status/i)
    expect(looksLikeGitHubProblem(message)).toBe(false)
  })

  it('an App with no contents permission at all is treated the same', () => {
    expect(looksLikeGitHubProblem(errorSeen({ kind: 'app', installedOnRepo: true, contents: undefined }))).toBe(false)
  })

  it('an App with write that is not installed on the repo gets the installation message', () => {
    // The tillerwell shape: a public repo reads with any token, so only the write fails.
    const message = errorSeen({ kind: 'app', installedOnRepo: false, contents: 'write' })
    expect(message).toContain('not installed on that repository')
    expect(message).toContain('acme/site under Repository access')
    expect(looksLikeGitHubProblem(message)).toBe(false)
  })

  it('a token without push gets the token wording and no hint', () => {
    const message = errorSeen({ kind: 'token', push: false })
    expect(message).toContain('GITHUB_API_TOKEN')
    expect(looksLikeGitHubProblem(message)).toBe(false)
  })

  it('write permission present but a 403 anyway keeps the outage hint', () => {
    expect(writeAccessProblem({ kind: 'app', installedOnRepo: true, contents: 'write' }, 'acme', 'site')).toBeNull()
    expect(looksLikeGitHubProblem(errorSeen({ kind: 'app', installedOnRepo: true, contents: 'write' }))).toBe(true)
    expect(looksLikeGitHubProblem(errorSeen({ kind: 'token', push: true }))).toBe(true)
  })

  it('an unreadable permission set never blocks the write', () => {
    expect(writeAccessProblem({ kind: 'unknown' }, 'acme', 'site')).toBeNull()
    expect(writeAccessProblem({ kind: 'token', push: undefined }, 'acme', 'site')).toBeNull()
  })
})
