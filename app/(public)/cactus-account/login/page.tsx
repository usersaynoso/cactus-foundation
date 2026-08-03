import LoginForm from '@/components/members/LoginForm'
import { getSessionFromCookie } from '@/lib/auth/session'
import { sanitizeRedirect } from '@/lib/auth/redirect'
import { getMemberAreaPath, isPublicMemberPath } from '@/lib/members/paths'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ redirect?: string; magic_token?: string; admin_link?: string }> }

// Why the staff shortcut didn't happen, in the visitor's terms. Anything else
// (a plain bounce with no reason) says nothing at all: an ordinary signed-out
// visitor has no idea what a staff account is and doesn't need telling.
const ADMIN_LINK_NOTICES: Record<string, string> = {
  failed: 'Your browser did not keep the sign-in, so we could not bring your admin account through. Signing in below will work.',
  unavailable: 'Your admin account cannot use the member area at the moment. Sign in with a member account instead.',
}

export default async function MemberLoginPage({ searchParams }: Props) {
  const { redirect, magic_token: magicToken, admin_link: adminLink } = await searchParams
  const basePath = `/${getMemberAreaPath()}`

  // Signing in only to land back on the sign-in page is a loop, so a redirect
  // aimed at one of the signed-out pages is dropped for the account overview.
  // The overview is also the fallback when there is no ?redirect= at all: a
  // sign-in link arrives from an email carrying nothing but its token, and
  // somebody who has just signed in wants their account, not the homepage.
  const target = sanitizeRedirect(redirect, basePath)
  const safeTarget = isPublicMemberPath(target, basePath) ? basePath : target

  // A signed-in admin who has landed here has either signed out of the member
  // area deliberately or come straight to this URL. Either way the offer beats
  // making them find a password they may never have set: one click and they are
  // in as themselves. Withheld when the shortcut has just failed - repeating it
  // would only produce the same failure.
  const notice = adminLink ? ADMIN_LINK_NOTICES[adminLink] : undefined
  const admin = adminLink === 'failed' || magicToken ? null : await getSessionFromCookie()

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem' }}>
      {notice && (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
          {notice}
        </div>
      )}

      {admin && (
        <div
          className="card"
          style={{
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          <p style={{ margin: 0, color: 'var(--color-text)', fontSize: 'var(--text-sm)' }}>
            You are signed in to this site as an admin ({admin.email}).
          </p>
          <a
            className="btn btn-primary"
            href={`/api/members/auth/admin-continue?redirect=${encodeURIComponent(safeTarget)}`}
          >
            Continue to your account
          </a>
        </div>
      )}

      <LoginForm redirectTo={safeTarget} magicToken={magicToken} />
    </div>
  )
}
