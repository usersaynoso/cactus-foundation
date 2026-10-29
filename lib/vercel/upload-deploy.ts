import { createHash } from 'node:crypto'
import { getVercelProjectName, resolveVercelTeamId, type RedeployResult } from '@/lib/vercel/deploy'
import type { TarFile } from '@/lib/vercel/tarball'

const VERCEL_API = 'https://api.vercel.com'
const UPLOAD_CONCURRENCY = 16

// A production deployment built from files Cactus hands over, the way `vercel deploy
// --prod` makes one. This is how a project with no Git link gets a commit built: a
// redeploy there only replays the previous upload, but a fresh upload of the commit's
// files is a real build of that commit.
//
// Vercel stores files by SHA-1 across the whole account, so the deployment is asked
// for first with only the file list. It answers `missing_files` with the digests it
// has never seen; those are uploaded and the deployment asked for again. A site whose
// last deploy was a CLI upload of nearly the same tree uploads a handful of files.

export type DeployGitMetadata = {
  commitSha: string
  commitRef: string
  commitMessage?: string
  remoteUrl?: string
}

type FileEntry = { file: string; sha: string; size: number; mode: number }

function teamQuery(teamId: string | null, extra = ''): string {
  const parts = [teamId ? `teamId=${encodeURIComponent(teamId)}` : '', extra].filter(Boolean)
  return parts.length ? `?${parts.join('&')}` : ''
}

async function uploadFile(token: string, teamId: string | null, sha: string, data: Buffer): Promise<void> {
  const res = await fetch(`${VERCEL_API}/v2/files${teamQuery(teamId)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(data.length),
      'x-vercel-digest': sha,
    },
    body: new Uint8Array(data),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`File upload failed (${res.status}): ${await res.text()}`)
}

async function uploadAll(
  token: string,
  teamId: string | null,
  shas: string[],
  bySha: Map<string, Buffer>
): Promise<void> {
  const queue = [...shas]
  const worker = async () => {
    for (let sha = queue.shift(); sha !== undefined; sha = queue.shift()) {
      const data = bySha.get(sha)
      if (!data) throw new Error(`Vercel asked for a file that is not in the deployment (${sha})`)
      await uploadFile(token, teamId, sha, data)
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker))
}

type CreateResponse =
  | { ok: true; id: string }
  | { ok: false; missing: string[] | null; error: string }

async function createDeployment(
  token: string,
  teamId: string | null,
  body: Record<string, unknown>
): Promise<CreateResponse> {
  const res = await fetch(`${VERCEL_API}/v13/deployments${teamQuery(teamId, 'skipAutoDetectionConfirmation=1')}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  if (res.ok) {
    const data = JSON.parse(text) as { id?: string; uid?: string }
    const id = data.id ?? data.uid
    return id ? { ok: true, id } : { ok: false, missing: null, error: 'Deployment created without an id' }
  }
  let parsed: { error?: { code?: string; missing?: unknown } } = {}
  try {
    parsed = JSON.parse(text) as typeof parsed
  } catch {
    // Not JSON - reported as-is below.
  }
  if (parsed.error?.code === 'missing_files') {
    const missing = Array.isArray(parsed.error.missing)
      ? parsed.error.missing.filter((s): s is string => typeof s === 'string')
      : null
    return { ok: false, missing, error: 'missing_files' }
  }
  return { ok: false, missing: null, error: `Deployment API error (${res.status}): ${text}` }
}

export async function deployVercelFiles(
  token: string,
  projectId: string,
  files: TarFile[],
  git?: DeployGitMetadata
): Promise<RedeployResult> {
  try {
    if (files.length === 0) return { triggered: false, error: 'No files to deploy' }

    const [teamId, name] = await Promise.all([
      resolveVercelTeamId(token, projectId),
      getVercelProjectName(token, projectId),
    ])
    const bySha = new Map<string, Buffer>()
    const entries: FileEntry[] = files.map((f) => {
      const sha = createHash('sha1').update(f.data).digest('hex')
      bySha.set(sha, f.data)
      return { file: f.path, sha, size: f.data.length, mode: f.mode }
    })

    const body: Record<string, unknown> = {
      name: name ?? projectId,
      project: projectId,
      target: 'production',
      files: entries,
      ...(git ? { gitMetadata: { ...git, dirty: false } } : {}),
    }

    let result = await createDeployment(token, teamId, body)
    if (!result.ok && result.error === 'missing_files') {
      // No list means Vercel did not say which: send everything once.
      await uploadAll(token, teamId, result.missing ?? [...bySha.keys()], bySha)
      result = await createDeployment(token, teamId, body)
    }
    if (!result.ok) {
      return {
        triggered: false,
        error: result.error === 'missing_files' ? 'Vercel still reports missing files after upload' : result.error,
      }
    }
    return { triggered: true, deploymentId: result.id }
  } catch (err: unknown) {
    return { triggered: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
