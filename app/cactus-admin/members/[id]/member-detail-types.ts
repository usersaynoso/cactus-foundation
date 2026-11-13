// Shapes the member detail screen is handed by its server page. A plain file
// with no 'use client', so the server page can import the types without pulling
// the client bundle's module graph along.

export type MemberStatusValue = 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'DELETED'

export type MemberDetail = {
  id: string
  email: string
  username: string
  displayName: string | null
  fullName: string | null
  organisation: string | null
  bio: string | null
  websiteUrl: string | null
  status: MemberStatusValue
  trusted: boolean
  emailVerified: boolean
  emailVerifiedAt: string | null
  // Kept in step with their most recent answer (see lib/members/marketing-consent.ts).
  // Null means nobody has asked, which is not the same as a no.
  marketingConsent: boolean | null
  roleName: string | null
  avatarChoice: 'UPLOAD' | 'GRAVATAR' | 'GENERATED'
  avatarUrl: string | null
  suspensionReason: string | null
  suspendedUntil: string | null
  deletionScheduledAt: string | null
  createdAt: string
  /** The member area identity of a staff account, rather than a customer. */
  isStaff: boolean
}

/** Which profile fields this site asks members for (lib/members/config.ts). */
export type MemberProfileFields = {
  displayName: boolean
  bioAndWebsite: boolean
  organisation: boolean
}

export type MemberSecuritySummary = {
  hasPassword: boolean
  passkeyCount: number
  twoFactorMethods: Array<'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS'>
  activeSessionCount: number
  lastActiveAt: string | null
  lastLoginAt: string | null
}

export type MemberDetailPermissions = {
  canEdit: boolean
  canSuspend: boolean
  canApprove: boolean
  canTrust: boolean
  canNotes: boolean
  canDelete: boolean
}

export type MemberNote = { id: string; body: string; authorName: string | null; createdAt: string }
export type MemberSessionRow = { id: string; ipAddress: string | null; userAgent: string | null; lastActiveAt: string; createdAt: string }
export type MemberLogEntry = { id: string; actorName: string | null; action: string; detail: unknown; createdAt: string }
