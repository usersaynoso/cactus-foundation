export type MemberTwoFactorMethod = 'EMAIL' | 'AUTHENTICATOR_APP' | 'SMS'

// A blank destination on the reusable sign-in block means the member account,
// matching the dedicated sign-in page. Owners can still name another internal
// page explicitly in the block settings.
export function memberLoginDestination(redirectTo: string, memberBasePath: string): string {
  return redirectTo || memberBasePath || '/'
}

// Keep the delivery confirmation beside the code box. In particular, an email
// code arrives after a password submit with no other visible sign that anything
// has been sent, which otherwise makes the code box look rather unexplained.
export function memberTwoFactorMessage(
  method: MemberTwoFactorMethod,
  email: string,
  destination = '',
): string | null {
  if (method === 'EMAIL') {
    return `We've sent a sign-in code to ${email}. It expires in 10 minutes.`
  }
  if (method === 'SMS') {
    return `We've sent a code by text message${destination ? ` to ${destination}` : ''}.`
  }
  return null
}
