export type MemberSecondFactorCandidate = {
  id: string
  method: 'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS'
  verified: boolean
  secretEncrypted: string | null
  phoneEncrypted: string | null
  lastStep: bigint | null
}

export type MemberPasswordSecondFactor = {
  id: string | null
  method: 'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS'
  secretEncrypted: string | null
  phoneEncrypted: string | null
  lastStep: bigint | null
}

// Email is the built-in second factor for password sign-in. A member only has
// to enrol something when they want to replace it with an authenticator app or
// SMS. Returning the same small shape for the built-in fallback keeps both
// halves of login on one decision rule.
export function memberPasswordSecondFactor(
  candidates: MemberSecondFactorCandidate[],
  emailCodesAvailable: boolean
): MemberPasswordSecondFactor | null {
  const sms = candidates.find(
    (candidate) => candidate.method === 'SMS' && candidate.verified && candidate.phoneEncrypted
  )
  if (sms) return sms

  const authenticator = candidates.find(
    (candidate) => candidate.method === 'AUTHENTICATOR_APP' && candidate.verified
  )
  if (authenticator) return authenticator

  const email = candidates.find(
    (candidate) => candidate.method === 'EMAIL' && candidate.verified
  )
  if (email && emailCodesAvailable) return email

  if (!emailCodesAvailable) return null
  return {
    id: null,
    method: 'EMAIL',
    secretEncrypted: null,
    phoneEncrypted: null,
    lastStep: null,
  }
}
