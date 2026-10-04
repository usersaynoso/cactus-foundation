export type MemberLoginMethods = {
  passkey: boolean
  password: boolean
  magicLink: boolean
}

type HeldLoginCredentials = {
  hasPasskey: boolean
  hasPassword: boolean
}

// The email link is the way into an account that has no enrolled credential,
// not a way round one that does. Judge that against methods the site currently
// allows so switching an enrolled method off does not strand the member.
export function memberLoginMethods(
  siteAllows: MemberLoginMethods,
  held: HeldLoginCredentials
): MemberLoginMethods {
  const passkey = siteAllows.passkey && held.hasPasskey
  const password = siteAllows.password && held.hasPassword

  return {
    passkey,
    password,
    magicLink: siteAllows.magicLink && !passkey && !password,
  }
}
