import { getInstalledModuleNames } from '@/lib/modules/live-status'

// The gate every generated module entry point asks before it hands a request to a
// module. A module that has been switched off ('inactive' or 'failed') is hidden in
// the admin, but its compiled code stays in the build until the next deploy - so
// without this its API routes, public pages and admin screens kept answering (a
// disabled contact form still took posts).
//
// "Live" means installed on this site (INSTALLED_MODULE_STATUSES), answered from the
// 30 second memo in live-status.ts, so the hot path adds no query of its own.
//
// FAILS OPEN. If the status read throws - a database blip - the module is treated
// as live and the request goes through as it always did. The alternative is a 404
// on every shop page for as long as the database is struggling, and a CDN in front
// would happily cache those 404s.
export async function isModuleLive(name: string): Promise<boolean> {
  try {
    return (await getInstalledModuleNames()).has(name)
  } catch {
    return true
  }
}
