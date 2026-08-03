import { prisma } from '@/lib/db/prisma'
import { isEmailConfigured } from '@/lib/config/env'
import {
  isAuthMethodEnabled,
  isAuthMethodRequired,
  type AuthMethod,
  type MembersConfig,
} from '@/lib/members/config'

// The two methods a member holds something for. A passkey is a device
// credential and a password is a secret, so both have to be enrolled before
// they exist; the email sign-in link needs neither, which is why MAGIC_LINK
// has no REQUIRED state to enforce in the first place.
export const ENROLABLE_AUTH_METHODS = ['PASSKEY', 'PASSWORD'] as const
export type EnrolableAuthMethod = (typeof ENROLABLE_AUTH_METHODS)[number]

// What the member already holds, in the shape the pure check below wants.
export type HeldAuthCredentials = {
  hasPasskey: boolean
  hasPassword: boolean
  // Any verified second factor - authenticator app, email code or SMS.
  hasTwoFactor: boolean
}

// Which required methods this member has yet to set up. Pure so the rules can
// be tested without a database.
//
// A password counts as set up only once a second factor exists alongside it:
// member password sign-in always demands one (app/api/members/auth/password/
// login), so a password on its own is a credential that cannot actually sign
// anyone in, and calling the requirement satisfied would be a lie the member
// only discovers at the sign-in screen.
export function outstandingAuthSetup(
  config: MembersConfig,
  held: HeldAuthCredentials
): EnrolableAuthMethod[] {
  const outstanding: EnrolableAuthMethod[] = []
  if (isAuthMethodRequired(config, 'PASSKEY') && !held.hasPasskey) {
    outstanding.push('PASSKEY')
  }
  if (isAuthMethodRequired(config, 'PASSWORD') && !(held.hasPassword && held.hasTwoFactor)) {
    outstanding.push('PASSWORD')
  }
  return outstanding
}

export async function memberOutstandingAuthSetup(
  config: MembersConfig,
  memberId: string
): Promise<EnrolableAuthMethod[]> {
  // Nothing required means nothing to look up - the common case, and this runs
  // on every member-area request.
  if (!ENROLABLE_AUTH_METHODS.some((method) => isAuthMethodRequired(config, method))) {
    return []
  }

  const record = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      password: { select: { id: true } },
      passkeys: { select: { id: true }, take: 1 },
      twoFactorConfigs: { where: { verified: true }, select: { id: true }, take: 1 },
    },
  })
  if (!record) return []

  return outstandingAuthSetup(config, {
    hasPasskey: record.passkeys.length > 0,
    hasPassword: record.password !== null,
    hasTwoFactor: record.twoFactorConfigs.length > 0,
  })
}

// Whether a brand-new account can reach its first session at all. Passkeys and
// passwords are both enrolled from inside a signed-in account, so the email
// sign-in link is the only way in for someone who has just registered - turn it
// off and new members are stranded on the sign-in screen looking at nothing
// they can use. Existing members with a passkey or password are unaffected,
// which is exactly why this is worth saying out loud in the admin screen rather
// than leaving to be discovered.
export function newMembersCanSignIn(config: MembersConfig, emailConfigured: boolean): boolean {
  return isAuthMethodEnabled(config, 'MAGIC_LINK') && emailConfigured
}

export async function newMembersCanSignInNow(config: MembersConfig): Promise<boolean> {
  return newMembersCanSignIn(config, isEmailConfigured())
}

// Guards the settings save: a site with every method off has no sign-in at all,
// and no screen from which to put that right except the admin one they have
// just left.
export function hasAnyAuthMethod(config: MembersConfig): boolean {
  const methods: AuthMethod[] = ['PASSKEY', 'MAGIC_LINK', 'PASSWORD']
  return methods.some((method) => isAuthMethodEnabled(config, method))
}
