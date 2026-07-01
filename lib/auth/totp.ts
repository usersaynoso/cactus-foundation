import { Secret, TOTP } from 'otpauth'
import QRCode from 'qrcode'

const ISSUER = 'Cactus Foundation'

function makeTotp(secret: string, accountLabel: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  })
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}

export function buildOtpauthUri(secret: string, accountLabel: string): string {
  return makeTotp(secret, accountLabel).toString()
}

export async function generateQrDataUrl(uri: string): Promise<string> {
  return QRCode.toDataURL(uri)
}

// window: 1 allows the code from the previous/next 30s step either side, to
// tolerate clock drift between the server and the admin's phone.
export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = makeTotp(secret, 'verify')
  const delta = totp.validate({ token: code, window: 1 })
  return delta !== null
}
