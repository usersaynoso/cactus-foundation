/**
 * Digital Asset Links (get_login_creds) for native Android apps that create
 * passkeys for this site's members through Credential Manager - the Android
 * twin of lib/auth/ios-webcredentials.ts.
 *
 * Two things follow from one setting, ANDROID_WEBCREDENTIAL_APPS:
 *
 *  1. /.well-known/assetlinks.json says which apps (package name plus the
 *     SHA-256 fingerprint of the certificate that signs them) may use this
 *     site's passkeys. Android refuses to create or use a passkey for this
 *     site's RP ID from any app the file does not name.
 *  2. A passkey made in such an app reports its origin as
 *     `android:apk-key-hash:<base64url of that fingerprint>` rather than the
 *     site's https address, so member passkey registration accepts exactly
 *     those origins as well as the site's own (lib/members/passkey.ts).
 *
 * Format: comma or space separated `package.name:FINGERPRINT`, the fingerprint
 * as `keytool`/Play Console print it (32 colon-separated hex pairs). Anything
 * that does not parse is ignored rather than guessed at. Only the
 * `get_login_creds` relation is published: `handle_all_urls` would also hand
 * the app every link to the site, which nobody asked for.
 */

const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/
const FINGERPRINT_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

export type AndroidWebCredentialApp = { packageName: string; fingerprint: string }

export function parseAndroidWebCredentialApps(raw: string | undefined): AndroidWebCredentialApp[] {
  if (!raw?.trim()) return []
  const out: AndroidWebCredentialApp[] = []
  const seen = new Set<string>()
  for (const part of raw.split(/[\s,]+/)) {
    const entry = part.trim()
    if (!entry) continue
    const colon = entry.indexOf(':')
    if (colon <= 0) continue
    const packageName = entry.slice(0, colon)
    const fingerprint = entry.slice(colon + 1).toUpperCase()
    if (!PACKAGE_PATTERN.test(packageName) || !FINGERPRINT_PATTERN.test(fingerprint)) continue
    const key = `${packageName}|${fingerprint}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ packageName, fingerprint })
  }
  return out
}

export function androidWebCredentialAppsFromEnv(): AndroidWebCredentialApp[] {
  return parseAndroidWebCredentialApps(process.env.ANDROID_WEBCREDENTIAL_APPS)
}

type AssetLinkStatement = {
  relation: string[]
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] }
}

export function buildAndroidAssetLinks(apps = androidWebCredentialAppsFromEnv()): AssetLinkStatement[] | null {
  if (apps.length === 0) return null
  const byPackage = new Map<string, string[]>()
  for (const app of apps) byPackage.set(app.packageName, [...(byPackage.get(app.packageName) ?? []), app.fingerprint])
  return [...byPackage.entries()].map(([packageName, fingerprints]) => ({
    relation: ['delegate_permission/common.get_login_creds'],
    target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
  }))
}

/** The WebAuthn origin a passkey made in that app reports. */
export function androidApkKeyHashOrigin(fingerprint: string): string {
  const bytes = Buffer.from(fingerprint.replace(/:/g, ''), 'hex')
  return `android:apk-key-hash:${bytes.toString('base64url')}`
}

export function androidWebCredentialOrigins(apps = androidWebCredentialAppsFromEnv()): string[] {
  return [...new Set(apps.map((app) => androidApkKeyHashOrigin(app.fingerprint)))]
}
