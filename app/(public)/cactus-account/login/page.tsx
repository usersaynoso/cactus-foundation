import LoginForm from '@/components/members/LoginForm'
import { getSessionFromCookie } from '@/lib/auth/session'
import { sanitizeRedirect } from '@/lib/auth/redirect'
import { getMemberAreaPath, isPublicMemberPath } from '@/lib/members/paths'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { renderLayoutWithContent } from '@/lib/puck/renderLayoutWithContent'
import { getPuckRenderMetadata } from '@/lib/puck/renderMetadata'
import type { Data } from '@puckeditor/core'

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

  // An "Account Login" layout, if the owner has published one. Resolved by type
  // alone (site-wide is the only rule the type offers - there is one sign-in
  // page), and entirely optional: with none published the page renders below
  // exactly as it always has.
  const layout = await resolveThemeLayout('memberLogin', { pathname: `${basePath}/login` }).catch(() => null)

  // The form and everything it needs to work: the ?redirect= the visitor
  // arrived with, the magic-link token from their email, the staff shortcut.
  // This is what drops into the layout's Content Slot, which is why none of it
  // is a block the owner places - a placed block would know none of it.
  //
  // The 440px cap travels with the form rather than with the page wrapper, so a
  // design that gives the slot a whole column still gets a form of a sensible
  // width instead of one stretched across it.
  const body = (
    <div style={{ maxWidth: 440, margin: '0 auto' }}>
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

  if (layout?.builderData) {
    return renderLayoutWithContent(layout.builderData as Data, body, await getPuckRenderMetadata())
  }

  return <div style={{ margin: '4rem auto', padding: '0 1.5rem' }}>{body}</div>
}
