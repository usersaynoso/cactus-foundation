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

export type TotpValidation = { valid: boolean; step: number | null }

// window: 1 allows the code from the previous/next 30s step either side, to
// tolerate clock drift between the server and the admin's phone.
//
// lastStep, when given, rejects a code whose absolute time-step is <= the
// last accepted step for this account — closes the ~90s replay window a
// bare boolean check leaves open, since the same 6-digit code stays valid
// for the whole window otherwise.
export function verifyTotpCode(secret: string, code: string, lastStep?: bigint | number | null): TotpValidation {
  const totp = makeTotp(secret, 'verify')
  const delta = totp.validate({ token: code, window: 1 })
  if (delta === null) return { valid: false, step: null }

  const step = Math.floor(Date.now() / 1000 / totp.period) + delta
  if (lastStep != null && step <= Number(lastStep)) {
    return { valid: false, step: null }
  }
  return { valid: true, step }
}
