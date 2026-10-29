// Whether the connected GitHub App or token can WRITE to the install's repository.
//
// Updates read the repo happily on a read-only connection - getRef, getTree and the rest
// all succeed - and only fall over at createTree with "Resource not accessible by
// integration". That is the same text GitHub returns while its App auth service is
// degraded, so the failure used to arrive at the owner as "check GitHub's status page",
// which sends them off to wait out an outage that is not happening. Asking first turns it
// into a message they can act on.
//
// Pure on purpose: the update panel imports the marker below in the browser, and the
// probe that fills a WriteAccessProbe (which needs the database) lives in ./client.

export type WriteAccessProbe =
  // GitHub App installation: the permissions the installation token was minted with.
  | { kind: 'app'; contents: string | undefined }
  // Personal access token: the repo's `permissions.push` as that token sees it.
  | { kind: 'token'; push: boolean | undefined }
  // The probe itself failed. Not a reason to refuse - the write will say what is wrong.
  | { kind: 'unknown' }

// Every write-permission message carries this phrase, and nothing GitHub says does.
// github-outage.ts keys off it to keep the status-page hint away from a permissions fault.
export const WRITE_PERMISSION_MARKER = 'cannot write to'

export function writePermissionMessage(owner: string, repo: string, kind: 'app' | 'token'): string {
  if (kind === 'token') {
    return (
      `The connected GitHub token ${WRITE_PERMISSION_MARKER} ${owner}/${repo}. Give GITHUB_API_TOKEN ` +
      'Contents: Read and write on that repository (or connect a GitHub App under Settings, ' +
      'Integrations), then try again.'
    )
  }
  return (
    `The connected GitHub App ${WRITE_PERMISSION_MARKER} ${owner}/${repo}. In GitHub, open the App's ` +
    'settings, set Repository permissions -> Contents to Read and write, then accept the permission ' +
    'update on the installation (Settings -> Integrations).'
  )
}

/** The message to fail with, or null when the write may go ahead. */
export function writeAccessProblem(probe: WriteAccessProbe, owner: string, repo: string): string | null {
  if (probe.kind === 'app' && probe.contents !== 'write') return writePermissionMessage(owner, repo, 'app')
  if (probe.kind === 'token' && probe.push === false) return writePermissionMessage(owner, repo, 'token')
  return null
}

export function isWritePermissionError(message: string | null | undefined): boolean {
  return !!message && message.toLowerCase().includes(WRITE_PERMISSION_MARKER)
}
