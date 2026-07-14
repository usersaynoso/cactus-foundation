// Throwaway Neon branches for the backup round-trip test.
//
// A Neon branch is a copy-on-write clone: creating one off the test project gives
// a full, isolated copy of its data in seconds, and writes to it can't touch the
// parent. That makes it the only honest way to test a restore, which is by nature
// destructive - TRUNCATE every table, then replay.
//
// Test-only. Nothing in the running app imports this.

const NEON_API = 'https://console.neon.tech/api/v2'

export type NeonBranch = {
  id: string
  name: string
  connectionUri: string
  endpointHost: string
}

type CreateBranchResponse = {
  branch: { id: string; name: string }
  endpoints: { id: string; host: string }[]
  connection_uris?: { connection_uri: string }[]
}

export type NeonProject = {
  id: string
  defaultBranchId: string
  connectionUri: string
  endpointHost: string
}

async function neon(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${NEON_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init?.headers,
    },
  })
}

// A dedicated throwaway project for the round-trip test: fully isolated, holds no
// real data, and is deleted whole afterwards. Preferred over branching an
// existing project so the test never depends on - or touches - a live database,
// and runs with any org-scoped key.
export async function createProject(apiKey: string, orgId: string, name: string): Promise<NeonProject> {
  const res = await neon(apiKey, `/projects`, {
    method: 'POST',
    body: JSON.stringify({ project: { org_id: orgId, name } }),
  })
  if (!res.ok) {
    throw new Error(`Neon: could not create project ${name} (${res.status}): ${await res.text()}`)
  }
  const body = (await res.json()) as {
    project: { id: string }
    branch: { id: string }
    endpoints: { host: string }[]
    connection_uris: { connection_uri: string }[]
  }
  const connectionUri = body.connection_uris?.[0]?.connection_uri
  const endpointHost = body.endpoints?.[0]?.host
  if (!connectionUri || !endpointHost) {
    throw new Error(`Neon: project ${name} came back with no connection URI`)
  }
  return { id: body.project.id, defaultBranchId: body.branch.id, connectionUri, endpointHost }
}

export async function deleteProject(apiKey: string, projectId: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await neon(apiKey, `/projects/${projectId}`, { method: 'DELETE' })
    if (res.ok || res.status === 404) return
    if (res.status !== 423) {
      throw new Error(`Neon: could not delete project ${projectId} (${res.status}): ${await res.text()}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`Neon: project ${projectId} stayed locked - delete it by hand`)
}

/** Neon rejects writes to a branch while its own create/delete operations are still running. */
async function waitForBranchIdle(apiKey: string, projectId: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await neon(apiKey, `/projects/${projectId}/operations?limit=20`)
    if (res.ok) {
      const body = (await res.json()) as { operations: { status: string }[] }
      const busy = body.operations.some((op) => op.status === 'running' || op.status === 'scheduling')
      if (!busy) return
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Timed out waiting for Neon operations to settle')
}

export async function createBranch(
  apiKey: string,
  projectId: string,
  parentBranchId: string,
  name: string,
): Promise<NeonBranch> {
  await waitForBranchIdle(apiKey, projectId)

  const res = await neon(apiKey, `/projects/${projectId}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      branch: { name, parent_id: parentBranchId },
      endpoints: [{ type: 'read_write' }],
    }),
  })
  if (!res.ok) {
    throw new Error(`Neon: could not create branch ${name} (${res.status}): ${await res.text()}`)
  }

  const body = (await res.json()) as CreateBranchResponse
  const connectionUri = body.connection_uris?.[0]?.connection_uri
  const endpointHost = body.endpoints[0]?.host
  if (!connectionUri || !endpointHost) {
    throw new Error(`Neon: branch ${name} came back with no connection URI`)
  }

  // The whole test is destructive, so prove the URI really is the branch we just
  // made and not, say, the parent's. A wrong URI here would TRUNCATE a live site.
  if (!connectionUri.includes(endpointHost)) {
    throw new Error(`Neon: connection URI for ${name} does not match its own endpoint host`)
  }

  return { id: body.branch.id, name: body.branch.name, connectionUri, endpointHost }
}

export async function deleteBranch(apiKey: string, projectId: string, branchId: string): Promise<void> {
  // 423 Locked = an operation on the branch is still in flight; it clears shortly.
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await neon(apiKey, `/projects/${projectId}/branches/${branchId}`, { method: 'DELETE' })
    if (res.ok || res.status === 404) return
    if (res.status !== 423) {
      throw new Error(`Neon: could not delete branch ${branchId} (${res.status}): ${await res.text()}`)
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`Neon: branch ${branchId} stayed locked and was not deleted - delete it by hand`)
}

/** Sweeps up branches left behind by a crashed run, so they can't accumulate. */
export async function deleteBranchesNamed(
  apiKey: string,
  projectId: string,
  prefix: string,
): Promise<void> {
  const res = await neon(apiKey, `/projects/${projectId}/branches`)
  if (!res.ok) return
  const body = (await res.json()) as { branches: { id: string; name: string }[] }
  const stale = body.branches.filter((b) => b.name.startsWith(prefix))
  // Children first - Neon refuses to delete a branch that still has one.
  for (const branch of stale.reverse()) {
    await deleteBranch(apiKey, projectId, branch.id).catch(() => {})
  }
}
