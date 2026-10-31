import type { SiteBackupRequest, SiteBackupState } from '@/cactus-host/protocol'
import { assertServerHostOk, serverHostFetch, sitePath } from './api'

// The site's own database backups on its server, through cactus-host: where the
// copies go, how often, and how the last one went. cactus-host does the work (a real
// pg_dump, which copes with a database of any size); this only reads and changes the
// settings, and asks for a run now.

export async function getServerBackup(token: string, siteId: string): Promise<SiteBackupState> {
  const res = await serverHostFetch(token, sitePath(siteId, '/backup'), { timeoutMs: 10_000 })
  await assertServerHostOk(res, 'read its backup settings')
  return ((await res.json()) as { backup: SiteBackupState }).backup
}

export async function saveServerBackup(token: string, siteId: string, body: SiteBackupRequest): Promise<SiteBackupState> {
  // Saving a folder checks the bucket can be reached, which is a round trip to the
  // storage provider; give it longer than a plain read.
  const res = await serverHostFetch(token, sitePath(siteId, '/backup'), { method: 'PUT', body, timeoutMs: 30_000 })
  await assertServerHostOk(res, 'save its backup settings')
  return ((await res.json()) as { backup: SiteBackupState }).backup
}

export async function runServerBackup(token: string, siteId: string): Promise<{ started: boolean; backup: SiteBackupState }> {
  const res = await serverHostFetch(token, sitePath(siteId, '/backup/run'), { method: 'POST', timeoutMs: 10_000 })
  await assertServerHostOk(res, 'start a backup')
  return (await res.json()) as { started: boolean; backup: SiteBackupState }
}
