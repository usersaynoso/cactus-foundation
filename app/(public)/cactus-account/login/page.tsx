import LoginForm from '@/components/members/LoginForm'
import { sanitizeRedirect } from '@/lib/auth/redirect'
import { getMemberAreaPath, isPublicMemberPath } from '@/lib/members/paths'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ redirect?: string; magic_token?: string }> }

export default async function MemberLoginPage({ searchParams }: Props) {
  const { redirect, magic_token: magicToken } = await searchParams
  const basePath = `/${getMemberAreaPath()}`

  // Signing in only to land back on the sign-in page is a loop, so a redirect
  // aimed at one of the signed-out pages is dropped for the account overview.
  const target = sanitizeRedirect(redirect)
  const safeTarget = isPublicMemberPath(target, basePath) ? basePath : target

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem' }}>
      <LoginForm redirectTo={safeTarget} magicToken={magicToken} />
    </div>
  )
}
