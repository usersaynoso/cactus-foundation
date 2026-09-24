/**
 * Apple App Site Association (webcredentials) for native iOS apps that embed
 * this site in WKWebView. See Supporting passkeys in a web view (Apple).
 */

const APP_ID_PATTERN = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/

export function parseIosWebCredentialAppIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  const ids: string[] = []
  for (const part of raw.split(/[\s,]+/)) {
    const id = part.trim()
    if (!id) continue
    if (!APP_ID_PATTERN.test(id)) continue
    ids.push(id)
  }
  return [...new Set(ids)]
}

export function iosWebCredentialAppIdsFromEnv(): string[] {
  return parseIosWebCredentialAppIds(process.env.IOS_WEBCREDENTIAL_APP_IDS)
}

export function buildAppleAppSiteAssociation(): { webcredentials: { apps: string[] } } | null {
  const apps = iosWebCredentialAppIdsFromEnv()
  if (apps.length === 0) return null
  return { webcredentials: { apps } }
}
