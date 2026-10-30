import { isCurrentSessionFresh } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { checkAndRecord } from '@/lib/auth/rate-limit'

// "Prove it is still you" before a dangerous action - rotating the encryption key
// today, anything else that cannot be undone tomorrow. A signed-in session alone
// is not enough: a borrowed, unlocked browser has one of those.
//
// An account with a password must type it again. One that signs in with passkeys
// only has no password to ask for, so it must have signed in within the last ten
// minutes instead (the same rule as enrolling a new authenticator).

export type StepUpResult = { ok: true } | { ok: false; status: 401 | 429; error: string }

export async function confirmStepUp(user: SessionUser, password: string | null | undefined): Promise<StepUpResult> {
  if (!user.passwordHash) {
    if (await isCurrentSessionFresh()) return { ok: true }
    return {
      ok: false,
      status: 401,
      error: 'For this one you need to have signed in within the last ten minutes. Sign out, sign back in, and try again.',
    }
  }

  if (!password) return { ok: false, status: 401, error: 'Enter your password to confirm.' }

  const limit = await checkAndRecord('step_up', [`account:${user.id}`])
  if (!limit.allowed) {
    return { ok: false, status: 429, error: 'Too many attempts. Wait a quarter of an hour and try again.' }
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, status: 401, error: 'That password is not right.' }
  }
  return { ok: true }
}
