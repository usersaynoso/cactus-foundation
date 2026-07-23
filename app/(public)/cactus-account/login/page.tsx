import LoginForm from '@/components/members/LoginForm'
import { sanitizeRedirect } from '@/lib/auth/redirect'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ redirect?: string; magic_token?: string }> }

export default async function MemberLoginPage({ searchParams }: Props) {
  const { redirect, magic_token: magicToken } = await searchParams

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem' }}>
      <LoginForm redirectTo={sanitizeRedirect(redirect)} magicToken={magicToken} />
    </div>
  )
}
