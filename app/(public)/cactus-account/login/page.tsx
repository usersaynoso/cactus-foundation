import LoginForm from '@/components/members/LoginForm'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ redirect?: string; magic_token?: string }> }

// Guards against an open-redirect via ?redirect= - only same-origin relative
// paths are honoured (no protocol-relative "//host" or absolute "scheme://" values).
function sanitizeRedirect(raw: string | undefined): string {
  if (!raw) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return '/'
  return raw
}

export default async function MemberLoginPage({ searchParams }: Props) {
  const { redirect, magic_token: magicToken } = await searchParams

  return (
    <div style={{ maxWidth: 440, margin: '4rem auto', padding: '0 1.5rem' }}>
      <LoginForm redirectTo={sanitizeRedirect(redirect)} magicToken={magicToken} />
    </div>
  )
}
