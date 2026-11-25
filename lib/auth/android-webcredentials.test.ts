import { afterEach, describe, expect, it, vi } from 'vitest'

const wellKnown = vi.hoisted(() => ({ file: null as string | null }))
vi.mock('@/lib/well-known/providers', () => ({ readWellKnownFile: async () => wellKnown.file }))
import {
  androidApkKeyHashOrigin,
  androidWebCredentialOrigins,
  buildAndroidAssetLinks,
  parseAndroidWebCredentialApps,
} from '@/lib/auth/android-webcredentials'
import { GET } from '@/app/.well-known/assetlinks.json/route'

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':')
const FP2 = Array.from({ length: 32 }, () => 'AB').join(':')

afterEach(() => {
  delete process.env.ANDROID_WEBCREDENTIAL_APPS
  wellKnown.file = null
})

describe('ANDROID_WEBCREDENTIAL_APPS', () => {
  it('reads package:fingerprint pairs and ignores anything that does not parse', () => {
    const apps = parseAndroidWebCredentialApps(
      `uk.co.example.app:${FP.toLowerCase()}, uk.co.example.app:${FP} nopackage:${FP} uk.co.example.app:AB:CD bad , com.other.app:${FP2}`
    )
    expect(apps).toEqual([
      { packageName: 'uk.co.example.app', fingerprint: FP },
      { packageName: 'com.other.app', fingerprint: FP2 },
    ])
    expect(parseAndroidWebCredentialApps(undefined)).toEqual([])
    expect(parseAndroidWebCredentialApps('  ')).toEqual([])
  })

  it('the origin is the base64url of the certificate hash, as Credential Manager reports it', () => {
    const expected = Buffer.from(FP.replace(/:/g, ''), 'hex').toString('base64url')
    expect(androidApkKeyHashOrigin(FP)).toBe(`android:apk-key-hash:${expected}`)
    expect(androidApkKeyHashOrigin(FP)).not.toContain('=')
  })

  it('assetlinks.json grants get_login_creds only, grouped by package', () => {
    const links = buildAndroidAssetLinks(parseAndroidWebCredentialApps(`a.b:${FP} a.b:${FP2}`))
    expect(links).toEqual([
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: { namespace: 'android_app', package_name: 'a.b', sha256_cert_fingerprints: [FP, FP2] },
      },
    ])
    expect(buildAndroidAssetLinks([])).toBeNull()
  })

  it('the route serves it, and 404s when nothing is configured', async () => {
    expect((await GET()).status).toBe(404)
    process.env.ANDROID_WEBCREDENTIAL_APPS = `a.b:${FP}`
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json())[0].target.package_name).toBe('a.b')
    expect(androidWebCredentialOrigins()).toEqual([androidApkKeyHashOrigin(FP)])
  })

  it("with the setting unset, a module's own assetlinks.json is still served", async () => {
    wellKnown.file = '[{"relation":["x"]}]'
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('[{"relation":["x"]}]')
  })
})
